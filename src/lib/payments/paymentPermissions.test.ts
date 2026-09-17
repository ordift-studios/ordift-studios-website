import { describe, expect, it } from "vitest";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES, canAccessPaymentsAdmin } from "@/lib/payments/paymentPermissions";
import type { CurrentUser } from "@/lib/portal/roles";

// manage_currencies gates the Exchange Rate Management admin screen —
// deliberately narrower than approve/reject_bank_transfer (staff gets
// those, not this), since a wrong rate has direct financial impact on
// every checkout, the same "narrower than default" reasoning already
// applied to issue_refund (PAYMENT_SECURITY_REVIEW.md §16).

function userWithRoles(roles: CurrentUser["roles"]): CurrentUser {
  return { id: "test-user", email: "test@ordiftstudios.invalid", fullName: "Test User", roles, accessStatus: "active" };
}

describe("PAYMENT_CAPABILITIES: manage_currencies", () => {
  it("grants admin", () => {
    expect(hasCapability(userWithRoles(["admin"]), PAYMENT_CAPABILITIES, "manage_currencies")).toBe(true);
  });

  it("grants super_admin", () => {
    expect(hasCapability(userWithRoles(["super_admin"]), PAYMENT_CAPABILITIES, "manage_currencies")).toBe(true);
  });

  it("does not grant staff", () => {
    expect(hasCapability(userWithRoles(["staff"]), PAYMENT_CAPABILITIES, "manage_currencies")).toBe(false);
  });

  it("does not grant client", () => {
    expect(hasCapability(userWithRoles(["client"]), PAYMENT_CAPABILITIES, "manage_currencies")).toBe(false);
  });

  it("does not grant a null user", () => {
    expect(hasCapability(null, PAYMENT_CAPABILITIES, "manage_currencies")).toBe(false);
  });
});

// Task 4 audit fix (2026-09-17, real Kelvin QA finding) — a plain
// `staff` role holder (e.g. a Senior Photographer with no finance
// responsibility) could previously reach the full company-wide
// payments review surface merely by holding the blanket `staff` role.
// Narrowed to admin/super_admin — this is the actual regression guard
// so that class of bug can't silently recur.
describe("canAccessPaymentsAdmin — real assertions (Task 4 regression guard, 2026-09-17)", () => {
  it("does NOT grant a plain staff role holder — the Kelvin exposure", () => {
    expect(canAccessPaymentsAdmin(userWithRoles(["staff"]))).toBe(false);
  });

  it("grants admin", () => {
    expect(canAccessPaymentsAdmin(userWithRoles(["admin"]))).toBe(true);
  });

  it("grants super_admin", () => {
    expect(canAccessPaymentsAdmin(userWithRoles(["super_admin"]))).toBe(true);
  });

  it("does not grant client or a null user", () => {
    expect(canAccessPaymentsAdmin(userWithRoles(["client"]))).toBe(false);
    expect(canAccessPaymentsAdmin(null)).toBe(false);
  });

  it("a dual staff+admin account is still granted access (admin, not staff, is what grants it)", () => {
    expect(canAccessPaymentsAdmin(userWithRoles(["staff", "admin"]))).toBe(true);
  });
});
