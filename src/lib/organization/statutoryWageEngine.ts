import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { getCurrentEmploymentTerms } from "@/lib/organization/employmentTermsHistory";

// Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 4 (2026-09-15) —
// Jurisdiction-Aware Statutory Wage Engine (migration 0108). Every
// jurisdiction's statutory floor keeps its own NATIVE legal basis —
// this module never forces a DAILY or HOURLY rate into a monthly
// figure by inventing a conversion; it only converts where a genuine,
// registered monthly_conversion_factor exists.

export const RATE_BASES = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "OTHER", "REVIEW_REQUIRED"] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export type ComplianceState = "COMPLIANT" | "BELOW_FLOOR" | "REVIEW_REQUIRED" | "NOT_APPLICABLE";

export interface StatutoryWageRule {
  id: string;
  jurisdictionId: string;
  employingEntityId: string | null;
  rateBasis: RateBasis;
  rateAmount: number | null;
  currency: string;
  monthlyConversionFactor: number | null;
  workerCategory: string | null;
  sourceAuthority: string | null;
  sourceReference: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  lastVerifiedDate: string | null;
  verificationStatus: "unverified" | "pending_review" | "verified";
  supersededBy: string | null;
  notes: string | null;
  legalReviewRequired: boolean;
}

const SELECT =
  "id, jurisdiction_id, employing_entity_id, rate_basis, rate_amount, currency, monthly_conversion_factor, worker_category, source_authority, source_reference, effective_from, effective_to, last_verified_date, verification_status, superseded_by, notes, legal_review_required";

function mapRow(r: {
  id: string;
  jurisdiction_id: string;
  employing_entity_id: string | null;
  rate_basis: string;
  rate_amount: number | null;
  currency: string;
  monthly_conversion_factor: number | null;
  worker_category: string | null;
  source_authority: string | null;
  source_reference: string | null;
  effective_from: string;
  effective_to: string | null;
  last_verified_date: string | null;
  verification_status: string;
  superseded_by: string | null;
  notes: string | null;
  legal_review_required: boolean;
}): StatutoryWageRule {
  return {
    id: r.id,
    jurisdictionId: r.jurisdiction_id,
    employingEntityId: r.employing_entity_id,
    rateBasis: r.rate_basis as RateBasis,
    rateAmount: r.rate_amount,
    currency: r.currency,
    monthlyConversionFactor: r.monthly_conversion_factor,
    workerCategory: r.worker_category,
    sourceAuthority: r.source_authority,
    sourceReference: r.source_reference,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    lastVerifiedDate: r.last_verified_date,
    verificationStatus: r.verification_status as StatutoryWageRule["verificationStatus"],
    supersededBy: r.superseded_by,
    notes: r.notes,
    legalReviewRequired: r.legal_review_required,
  };
}

export async function listStatutoryWageRules(): Promise<StatutoryWageRule[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("statutory_wage_rules").select(SELECT).order("effective_from", { ascending: false });
  if (error) {
    console.error("[organization] failed to load statutory_wage_rules", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

// The rule genuinely in force today for a jurisdiction (and, where one
// exists, a specific entity) — the most recent non-superseded row whose
// effective window covers today. Entity-specific rules are preferred
// over an entity-agnostic (employing_entity_id null) rule for the same
// jurisdiction, since a more specific rule always wins when both exist.
export async function getCurrentStatutoryWageRule(jurisdictionId: string, employingEntityId?: string | null): Promise<StatutoryWageRule | null> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("statutory_wage_rules")
    .select(SELECT)
    .eq("jurisdiction_id", jurisdictionId)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[organization] failed to load current statutory_wage_rules", error.message);
    return null;
  }
  const rows = (data ?? []).map(mapRow);
  if (employingEntityId) {
    const specific = rows.find((r) => r.employingEntityId === employingEntityId);
    if (specific) return specific;
  }
  return rows.find((r) => r.employingEntityId === null) ?? null;
}

export async function canManageStatutoryWageRules(actorUserId: string): Promise<boolean> {
  return isSuperAdminId(actorUserId);
}

export async function createStatutoryWageRule(params: {
  jurisdictionId: string;
  employingEntityId?: string | null;
  rateBasis: RateBasis;
  rateAmount?: number | null;
  currency: string;
  monthlyConversionFactor?: number | null;
  workerCategory?: string | null;
  sourceAuthority?: string | null;
  sourceReference?: string | null;
  effectiveFrom: string;
  notes?: string | null;
  legalReviewRequired?: boolean;
  actorUserId: string;
}): Promise<{ ok: true; ruleId: string } | { ok: false; error: string }> {
  if (!(await canManageStatutoryWageRules(params.actorUserId))) {
    return { ok: false, error: "Not authorized to register a statutory wage rule." };
  }
  if (!(RATE_BASES as readonly string[]).includes(params.rateBasis)) return { ok: false, error: "Unknown rate basis." };
  if (!params.currency.trim()) return { ok: false, error: "A currency is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("statutory_wage_rules")
    .insert({
      jurisdiction_id: params.jurisdictionId,
      employing_entity_id: params.employingEntityId ?? null,
      rate_basis: params.rateBasis,
      rate_amount: params.rateAmount ?? null,
      currency: params.currency,
      monthly_conversion_factor: params.monthlyConversionFactor ?? null,
      worker_category: params.workerCategory ?? null,
      source_authority: params.sourceAuthority ?? null,
      source_reference: params.sourceReference ?? null,
      effective_from: params.effectiveFrom,
      notes: params.notes ?? null,
      legal_review_required: params.legalReviewRequired ?? false,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to register the statutory wage rule." };

  await logActivity({ actorUserId: params.actorUserId, action: "statutory_wage_rule.created", entityType: "statutory_wage_rule", entityId: data.id, metadata: { jurisdictionId: params.jurisdictionId } });
  return { ok: true, ruleId: data.id };
}

export interface ComplianceResult {
  state: ComplianceState;
  explanation: string;
  rule: StatutoryWageRule | null;
  employeeMonthlySalary: number | null;
  employeeCurrency: string | null;
}

// Pure — the actual comparison logic, deliberately separate from the
// database lookups so it can be unit-tested directly and so the
// resulting explanation can always be traced back to a real rule.
// "No invisible calculation" (explicit instruction): every branch
// returns a human-readable reason, never a bare state.
export function compareSalaryToStatutoryFloor(rule: StatutoryWageRule | null, employeeMonthlySalary: number | null, employeeCurrency: string | null): ComplianceResult {
  if (!rule) {
    return { state: "NOT_APPLICABLE", explanation: "No statutory wage rule is registered for this jurisdiction.", rule: null, employeeMonthlySalary, employeeCurrency };
  }
  if (employeeMonthlySalary === null) {
    return { state: "REVIEW_REQUIRED", explanation: "No basic salary is on record for this person — cannot compare against the statutory floor.", rule, employeeMonthlySalary, employeeCurrency };
  }
  if (!employeeCurrency || employeeCurrency !== rule.currency) {
    return {
      state: "REVIEW_REQUIRED",
      explanation: `The employee's salary is recorded in ${employeeCurrency ?? "an unrecorded currency"}, but the statutory rule is denominated in ${rule.currency} — a cross-currency comparison is not made automatically.`,
      rule,
      employeeMonthlySalary,
      employeeCurrency,
    };
  }
  if (rule.rateBasis === "OTHER" || rule.rateBasis === "REVIEW_REQUIRED") {
    return { state: "REVIEW_REQUIRED", explanation: "This jurisdiction's statutory rate basis is not yet a directly comparable figure — legal review is required.", rule, employeeMonthlySalary, employeeCurrency };
  }
  if (rule.rateAmount === null) {
    return { state: "REVIEW_REQUIRED", explanation: "This statutory rule has no numeric rate amount recorded yet.", rule, employeeMonthlySalary, employeeCurrency };
  }

  if (rule.rateBasis === "MONTHLY") {
    const state: ComplianceState = employeeMonthlySalary >= rule.rateAmount ? "COMPLIANT" : "BELOW_FLOOR";
    return {
      state,
      explanation: `Compared directly: employee's monthly basic salary (${employeeMonthlySalary.toLocaleString()}) vs. the statutory monthly floor (${rule.rateAmount.toLocaleString()}) ${rule.currency}.`,
      rule,
      employeeMonthlySalary,
      employeeCurrency,
    };
  }

  // Non-monthly basis (HOURLY/DAILY/WEEKLY): only convert when a real,
  // registered monthly_conversion_factor exists — never an invented
  // "working days per month" assumption.
  if (rule.monthlyConversionFactor !== null) {
    const monthlyEquivalent = rule.rateAmount * rule.monthlyConversionFactor;
    const state: ComplianceState = employeeMonthlySalary >= monthlyEquivalent ? "COMPLIANT" : "BELOW_FLOOR";
    return {
      state,
      explanation: `Converted using the registered monthly-equivalent methodology: ${rule.rateAmount.toLocaleString()} ${rule.currency}/${rule.rateBasis.toLowerCase()} × ${rule.monthlyConversionFactor} = ${monthlyEquivalent.toLocaleString()} ${rule.currency}/month, compared against the employee's monthly basic salary (${employeeMonthlySalary.toLocaleString()}).`,
      rule,
      employeeMonthlySalary,
      employeeCurrency,
    };
  }

  return {
    state: "REVIEW_REQUIRED",
    explanation: `The registered statutory floor is expressed as a ${rule.rateBasis} rate, while this employee's basic salary is monthly. No approved jurisdiction-specific methodology for converting between these bases is registered — a direct comparison would require inventing an assumption this system is not authorized to make. Flagged for legal/compliance review rather than guessed.`,
    rule,
    employeeMonthlySalary,
    employeeCurrency,
  };
}

// Combines the two lookups + the pure comparison for one profile — the
// convenience entry point for both the wage-engine UI and the Super
// Admin oversight dashboard (Part 5).
export async function getStatutoryComplianceForProfile(profileId: string): Promise<ComplianceResult> {
  const terms = await getCurrentEmploymentTerms(profileId);
  if (!terms?.employmentJurisdictionId) {
    return { state: "NOT_APPLICABLE", explanation: "No employment jurisdiction is on record for this person.", rule: null, employeeMonthlySalary: terms?.basicSalary ?? null, employeeCurrency: terms?.currency ?? null };
  }
  const rule = await getCurrentStatutoryWageRule(terms.employmentJurisdictionId, terms.employingEntityId);
  return compareSalaryToStatutoryFloor(rule, terms.basicSalary, terms.currency);
}
