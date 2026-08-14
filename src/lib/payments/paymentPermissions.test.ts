import { describe, expect, it } from "vitest";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
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
