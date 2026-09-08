import { describe, expect, it } from "vitest";
import { TALENT_COMMISSION_TYPES, isValidCommissionType, validateCommercialTerms } from "./talentCommercialTerms";

describe("TALENT_COMMISSION_TYPES / isValidCommissionType", () => {
  it("is exactly none/flat_fee/percentage", () => {
    expect(TALENT_COMMISSION_TYPES).toEqual(["none", "flat_fee", "percentage"]);
  });
  it("rejects an unknown type", () => {
    expect(isValidCommissionType("royalty")).toBe(false);
  });
});

describe("validateCommercialTerms — no default value is ever supplied", () => {
  it('"none" requires a null commissionValue', () => {
    expect(validateCommercialTerms({ commissionType: "none", commissionValue: null, currency: null })).toEqual({ ok: true });
    expect(validateCommercialTerms({ commissionType: "none", commissionValue: 10, currency: null }).ok).toBe(false);
  });

  it("percentage/flat_fee require an explicit commissionValue — never defaulted", () => {
    expect(validateCommercialTerms({ commissionType: "percentage", commissionValue: null, currency: null }).ok).toBe(false);
    expect(validateCommercialTerms({ commissionType: "flat_fee", commissionValue: null, currency: "GHS" }).ok).toBe(false);
  });

  it("refuses a zero or negative commissionValue", () => {
    expect(validateCommercialTerms({ commissionType: "percentage", commissionValue: 0, currency: null }).ok).toBe(false);
    expect(validateCommercialTerms({ commissionType: "flat_fee", commissionValue: -5, currency: "GHS" }).ok).toBe(false);
  });

  it("refuses a percentage over 100", () => {
    expect(validateCommercialTerms({ commissionType: "percentage", commissionValue: 101, currency: null }).ok).toBe(false);
    expect(validateCommercialTerms({ commissionType: "percentage", commissionValue: 100, currency: null }).ok).toBe(true);
  });

  it("flat_fee requires a currency", () => {
    expect(validateCommercialTerms({ commissionType: "flat_fee", commissionValue: 500, currency: null }).ok).toBe(false);
    expect(validateCommercialTerms({ commissionType: "flat_fee", commissionValue: 500, currency: "GHS" })).toEqual({ ok: true });
  });

  it("a well-formed percentage grant passes without a currency requirement", () => {
    expect(validateCommercialTerms({ commissionType: "percentage", commissionValue: 15, currency: null })).toEqual({ ok: true });
  });
});
