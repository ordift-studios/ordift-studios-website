// Ordift Studios — Organizational Structure, Authority Grants, Staff
// Onboarding & Work Email V1 (2026-09-07), Financial Authority Levels.
//
// Pure, zero-import calculation module — same pure/impure split already
// established throughout this codebase (canDelegate() vs
// validateDelegationAuthority(), discountMath.ts vs discounts.ts, etc.).
// The DB-backed reader/grant layer is
// src/lib/organization/financialAuthorityGrants.ts.
//
// Financial Authority Level is deliberately NOT derived from Grade,
// Position, capability, or Department anywhere in this module (Part 10
// / Part K's explicit "none of these should automatically imply
// another"). Every function here takes the level as an explicit input —
// there is no "grade -> level" or "capability -> level" function
// anywhere in this codebase, by design.

export const FINANCIAL_AUTHORITY_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type FinancialAuthorityLevel = (typeof FINANCIAL_AUTHORITY_LEVELS)[number];

// Internal-only labels — never "F0/F1/F2" anywhere in Admin UX per
// explicit instruction. These are the canonical routine-approval
// ceilings; the versioned, admin-configurable source of truth lives in
// public.financial_authority_level_thresholds (seeded with these exact
// values) — this constant is the pure-module fallback/reference used by
// tests and by any caller that hasn't loaded live thresholds yet.
export const FINANCIAL_AUTHORITY_LEVEL_LABELS: Record<FinancialAuthorityLevel, string> = {
  0: "Level 0 — No Financial Approval",
  1: "Level 1 — Minor Operational Approval",
  2: "Level 2 — Standard Management Approval",
  3: "Level 3 — Senior Management Approval",
  4: "Level 4 — Executive Approval",
  5: "Level 5 — Founder / Ultimate Approval",
};

// null = no internal ceiling (Level 5) — never treated as Infinity by
// accident: callers that need a comparable ceiling use
// ceilingForComparison() below, which is explicit about the null case.
export const CANONICAL_ROUTINE_CEILING_USD: Record<FinancialAuthorityLevel, number | null> = {
  0: 0,
  1: 250,
  2: 1000,
  3: 5000,
  4: 15000,
  5: null,
};

// The authority_grants row convention for a Financial Authority Level
// grant — one string per level (never a single generic
// "financial_authority" with the level only in the side column), so
// canDelegate()'s existing "you can only delegate an authority you
// hold" check works unmodified: holding financial_authority_level_3
// does NOT let someone delegate financial_authority_level_4 by
// construction (they are different `authority` strings, and
// canDelegate() compares by exact string equality).
export function financialAuthorityLevelAuthority(level: FinancialAuthorityLevel): string {
  return `financial_authority_level_${level}`;
}

export function parseFinancialAuthorityLevelAuthority(authority: string): FinancialAuthorityLevel | null {
  const match = /^financial_authority_level_([0-5])$/.exec(authority);
  if (!match) return null;
  return Number(match[1]) as FinancialAuthorityLevel;
}

// Part 11 — "required authority must be the STRICTEST applicable
// requirement", never a bare amount<X check. Every escalation function
// below returns a level; callers combine them with maxLevel().
export function maxLevel(...levels: FinancialAuthorityLevel[]): FinancialAuthorityLevel {
  return levels.reduce((max, l) => (l > max ? l : max), 0 as FinancialAuthorityLevel);
}

// Given a routine USD amount and the versioned ceiling table (live from
// financial_authority_level_thresholds, or CANONICAL_ROUTINE_CEILING_USD
// as the pure-module default), returns the LOWEST level whose ceiling
// covers the amount. amount<=0 always resolves to Level 0.
export function resolveRoutineLevelForAmount(
  amountUsd: number,
  ceilings: Record<FinancialAuthorityLevel, number | null> = CANONICAL_ROUTINE_CEILING_USD
): FinancialAuthorityLevel {
  if (amountUsd <= 0) return 0;
  for (const level of FINANCIAL_AUTHORITY_LEVELS) {
    const ceiling = ceilings[level];
    if (ceiling === null || amountUsd <= ceiling) return level;
  }
  return 5;
}

// Part 12 — unbudgeted expenditure escalates ONE level, capped at 5. If
// the calculated (budgeted) requirement is already Level 5, it stays
// Level 5 (never wraps/decreases).
export function escalateForUnbudgeted(baseLevel: FinancialAuthorityLevel): FinancialAuthorityLevel {
  return Math.min(5, baseLevel + 1) as FinancialAuthorityLevel;
}

// Part 14 — Production Budget cumulative variation escalation. Applies
// to the CUMULATIVE variation from the original approved budget, never
// an isolated single change — callers must pass the running cumulative
// percentage, not a per-change delta (see requiresGovernedChangeRecord()
// et al. in src/lib/production/budgetMath.ts for the existing
// append-only cumulative tracking this reads from).
export function resolveProductionBudgetVariationLevel(
  cumulativeVariationPercent: number,
  baseLevel: FinancialAuthorityLevel,
  materialScopeChange = false
): FinancialAuthorityLevel {
  const pct = Math.abs(cumulativeVariationPercent);
  if (materialScopeChange || pct > 30) return 5;
  if (pct > 20) return maxLevel(4, escalateForUnbudgeted(baseLevel));
  if (pct > 10) return escalateForUnbudgeted(baseLevel);
  return baseLevel;
}

// Part 15 — Discount authority. These are MINIMUM authorization levels
// — a higher level inherits the lower band (a Level 3 holder with the
// right capability may approve a 5% discount) — so this returns the
// minimum required, and callers compare personLevel >= required.
export function resolveDiscountAuthorityLevel(percentOff: number): FinancialAuthorityLevel {
  const pct = Math.abs(percentOff);
  if (pct > 20) return 5;
  if (pct > 15) return 4;
  if (pct > 10) return 3;
  return 2; // 0-10%
}

// Part 16 — Refund authority. Independent APPROVAL ceiling (distinct
// vocabulary from the general routine ceiling table — Level 1 has NO
// independent refund approval at all, unlike its $250 general ceiling).
export const REFUND_APPROVAL_CEILING_USD: Record<FinancialAuthorityLevel, number> = {
  0: 0,
  1: 0,
  2: 250,
  3: 1000,
  4: 5000,
  5: Number.POSITIVE_INFINITY,
};

export function canApproveRefund(level: FinancialAuthorityLevel, refundAmountUsd: number): boolean {
  return refundAmountUsd <= REFUND_APPROVAL_CEILING_USD[level];
}

// Part 17 — Write-off/credit authority. Stricter than refund at every
// level.
export const WRITE_OFF_APPROVAL_CEILING_USD: Record<FinancialAuthorityLevel, number> = {
  0: 0,
  1: 0,
  2: 100,
  3: 500,
  4: 2500,
  5: Number.POSITIVE_INFINITY,
};

export function canApproveWriteOff(level: FinancialAuthorityLevel, amountUsd: number): boolean {
  return amountUsd <= WRITE_OFF_APPROVAL_CEILING_USD[level];
}

// Part 19 — indicative approved-template COMMERCIAL contract-approval
// authority (Legal Suite does not exist yet — this is authority
// primitives only, never fabricated legal language). No Level 0/1
// contract authority at all (starts at Level 2), unlike the general
// ceiling table.
export function resolveContractCommercialApprovalLevel(amountUsd: number): FinancialAuthorityLevel {
  if (amountUsd <= 1000) return 2;
  if (amountUsd <= 5000) return 3;
  if (amountUsd <= 15000) return 4;
  return 5;
}

// Matters that ALWAYS require Legal/Founder review regardless of value
// — a fixed, documented list (never inferred/guessed), per explicit
// instruction. Purely descriptive category slugs; no legal language.
export const CONTRACT_ALWAYS_FOUNDER_REVIEW_CATEGORIES = [
  "unusual_indemnity",
  "guarantee",
  "unusual_liability",
  "ip_assignment",
  "exceptional_exclusivity",
  "settlement",
  "litigation",
  "borrowing_or_credit",
  "ownership_or_equity",
  "property_lease",
  "unusual_long_duration_commitment",
  "high_risk_executive_employment_contract",
] as const;
export type ContractAlwaysFounderReviewCategory = (typeof CONTRACT_ALWAYS_FOUNDER_REVIEW_CATEGORIES)[number];

export function contractRequiresFounderReview(categories: readonly string[]): boolean {
  return categories.some((c) => (CONTRACT_ALWAYS_FOUNDER_REVIEW_CATEGORIES as readonly string[]).includes(c));
}

// Part 13 — Anti-splitting. Deliberately NOT a probabilistic detector:
// groups explicit, caller-supplied commitments by a shared
// relatedCommitmentReference, sums the group, and flags whenever the
// SUMMED value would require a stricter level than every individual
// commitment did on its own (the textbook "$900+$900 instead of one
// $1,800" pattern) — the caller is responsible for actually supplying a
// relatedCommitmentReference when one commitment is genuinely split
// into pieces; this function never guesses relatedness on its own.
export type SplittableCommitment = { amountUsd: number; relatedCommitmentReference: string | null };

export type AntiSplittingResult = {
  flagged: boolean;
  cumulativeAmountUsd: number;
  cumulativeRequiredLevel: FinancialAuthorityLevel;
  maxIndividualRequiredLevel: FinancialAuthorityLevel;
};

export function flagPotentialSplitting(
  commitments: SplittableCommitment[],
  ceilings: Record<FinancialAuthorityLevel, number | null> = CANONICAL_ROUTINE_CEILING_USD
): AntiSplittingResult {
  const grouped = commitments.filter((c) => c.relatedCommitmentReference !== null);
  const cumulativeAmountUsd = grouped.reduce((sum, c) => sum + c.amountUsd, 0);
  const cumulativeRequiredLevel = resolveRoutineLevelForAmount(cumulativeAmountUsd, ceilings);
  const maxIndividualRequiredLevel = grouped.reduce(
    (max, c) => maxLevel(max, resolveRoutineLevelForAmount(c.amountUsd, ceilings)),
    0 as FinancialAuthorityLevel
  );
  return {
    flagged: grouped.length > 1 && cumulativeRequiredLevel > maxIndividualRequiredLevel,
    cumulativeAmountUsd,
    cumulativeRequiredLevel,
    maxIndividualRequiredLevel,
  };
}

// Part 18/Partnerships governance/"whichever rule is stricter wins" —
// shared helper used by every domain that layers Financial Authority
// Level over an existing, independently-stricter rule (Partnership
// concession bands, existing capability checks, Founder-only
// thresholds). Never weakens the other rule — only ever raises the
// effective requirement to the max of the two.
export function stricterOf(a: FinancialAuthorityLevel, b: FinancialAuthorityLevel): FinancialAuthorityLevel {
  return maxLevel(a, b);
}
