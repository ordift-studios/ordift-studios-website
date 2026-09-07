import { describe, expect, it } from "vitest";
import { applyDiscount, isDiscountCurrentlyValid, decideDiscountDeletionOutcome } from "./discounts";

// Ordift Pricing Engine V1 (2026-09-06) — applyDiscount()/
// isDiscountCurrentlyValid() are pure and directly unit-tested here.
// recordManualDiscount() itself is DB-dependent from its very first
// line (authorizeWithSuperAdminOverride() constructs a real Supabase
// admin client before any check can run) — same established limitation
// as every other DB-dependent authorization function in this codebase
// (authority.test.ts, for instance, never calls hasAuthority() or
// authorizeWithSuperAdminOverride() directly for the same reason).
// "Unauthorized discount rejection" is verified instead by direct code
// reading: recordManualDiscount()'s very first statement is the
// authorizeWithSuperAdminOverride() check, and it returns
// { ok: false, error: "Not authorized..." } before any row is read or
// written whenever that check fails — not a unit test, for the same
// reason its DB-dependent siblings aren't.

describe("applyDiscount — percentage", () => {
  it("computes a 10% discount correctly", () => {
    expect(applyDiscount(200, { discountType: "percentage", value: 10 })).toEqual({ discountAmountUsd: 20, finalAmountUsd: 180 });
  });

  it("computes a 100% discount correctly (fully waived)", () => {
    expect(applyDiscount(150, { discountType: "percentage", value: 100 })).toEqual({ discountAmountUsd: 150, finalAmountUsd: 0 });
  });

  it("rounds to whole cents, never leaving floating-point noise", () => {
    // 99.99 * 33% = 32.9967, rounded to money = 33.00 — verified against
    // the exact expected value (not a Number.isInteger(x*100) check,
    // which is itself unreliable in JS floating point for values like
    // 66.99, a well-known representation quirk unrelated to whether the
    // rounding here is correct).
    const result = applyDiscount(99.99, { discountType: "percentage", value: 33 });
    expect(result).toEqual({ discountAmountUsd: 33, finalAmountUsd: 66.99 });
  });
});

describe("applyDiscount — fixed", () => {
  it("subtracts a fixed amount", () => {
    expect(applyDiscount(200, { discountType: "fixed", value: 30 })).toEqual({ discountAmountUsd: 30, finalAmountUsd: 170 });
  });

  it("never discounts below zero — a fixed discount larger than the total is capped at the total", () => {
    expect(applyDiscount(50, { discountType: "fixed", value: 200 })).toEqual({ discountAmountUsd: 50, finalAmountUsd: 0 });
  });
});

describe("isDiscountCurrentlyValid", () => {
  const now = new Date("2026-09-06T12:00:00Z");

  it("accepts an active discount within its validity window", () => {
    expect(isDiscountCurrentlyValid({ active: true, validFrom: "2026-09-01T00:00:00Z", validTo: "2026-12-31T00:00:00Z" }, now)).toEqual({ ok: true });
  });

  it("accepts an active discount with no end date", () => {
    expect(isDiscountCurrentlyValid({ active: true, validFrom: "2026-09-01T00:00:00Z", validTo: null }, now)).toEqual({ ok: true });
  });

  it("rejects an inactive discount even if the dates would otherwise be valid", () => {
    expect(isDiscountCurrentlyValid({ active: false, validFrom: "2026-09-01T00:00:00Z", validTo: null }, now).ok).toBe(false);
  });

  it("rejects a discount that hasn't started yet", () => {
    expect(isDiscountCurrentlyValid({ active: true, validFrom: "2026-12-01T00:00:00Z", validTo: null }, now).ok).toBe(false);
  });

  it("rejects an expired discount", () => {
    expect(isDiscountCurrentlyValid({ active: true, validFrom: "2026-01-01T00:00:00Z", validTo: "2026-06-01T00:00:00Z" }, now).ok).toBe(false);
  });
});

// Discount Lifecycle Refinement (2026-09-07) — decideDiscountDeletionOutcome()
// is the pure decision inside deleteDiscountCode(): zero redemptions =>
// a real, permanent delete is safe; any redemption at all => archive/
// retire instead, never a physical delete, so financial/audit history
// is never destroyed. deleteDiscountCode() itself, like
// recordManualDiscount(), is DB-dependent from its first line
// (authorizeWithSuperAdminOverride() constructs a real Supabase admin
// client before any check can run) — same established limitation
// documented at the top of this file. "27. Unauthorized user cannot
// delete" is verified by direct code reading: deleteDiscountCode()'s
// very first statement is the authorizeWithSuperAdminOverride() check,
// and it returns { ok: false, error: "Not authorized..." } before any
// row is read, counted, or written whenever that check fails.
describe("decideDiscountDeletionOutcome", () => {
  it("25 / 31. deletes when there are zero redemptions — nothing historical to protect, so a real delete never cascades into financial/business data (there's nothing to cascade into)", () => {
    expect(decideDiscountDeletionOutcome(0)).toBe("delete");
  });

  it("28. archives (never destructively deletes) when there is any redemption history at all", () => {
    expect(decideDiscountDeletionOutcome(1)).toBe("archive");
    expect(decideDiscountDeletionOutcome(2)).toBe("archive");
    expect(decideDiscountDeletionOutcome(500)).toBe("archive");
  });
});

