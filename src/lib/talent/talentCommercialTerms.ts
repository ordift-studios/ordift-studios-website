// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08).
// Pure validation for configurable commercial/commission structures.
// NO function in this file ever supplies or suggests a default
// commission_value — every real value must be explicitly provided by
// the caller, reflecting a real negotiated term.

export const TALENT_COMMISSION_TYPES = ["none", "flat_fee", "percentage"] as const;
export type TalentCommissionType = (typeof TALENT_COMMISSION_TYPES)[number];

export function isValidCommissionType(value: string): value is TalentCommissionType {
  return (TALENT_COMMISSION_TYPES as readonly string[]).includes(value);
}

export type CommercialTermsInput = {
  commissionType: string;
  commissionValue: number | null;
  currency: string | null;
};

export type ValidateCommercialTermsResult = { ok: true } | { ok: false; error: string };

export function validateCommercialTerms(input: CommercialTermsInput): ValidateCommercialTermsResult {
  if (!isValidCommissionType(input.commissionType)) {
    return { ok: false, error: `Unsupported commission type: "${input.commissionType}".` };
  }
  if (input.commissionType === "none") {
    if (input.commissionValue !== null) return { ok: false, error: 'commissionValue must be null when commissionType is "none".' };
    return { ok: true };
  }
  if (input.commissionValue === null || input.commissionValue === undefined) {
    return { ok: false, error: `commissionValue is required when commissionType is "${input.commissionType}" — it is never defaulted.` };
  }
  if (input.commissionValue <= 0) {
    return { ok: false, error: "commissionValue must be a positive number." };
  }
  if (input.commissionType === "percentage" && input.commissionValue > 100) {
    return { ok: false, error: "A percentage commission cannot exceed 100." };
  }
  if (input.commissionType === "flat_fee" && !input.currency) {
    return { ok: false, error: "currency is required for a flat_fee commission." };
  }
  return { ok: true };
}
