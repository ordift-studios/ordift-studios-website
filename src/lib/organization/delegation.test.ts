import { describe, expect, it } from "vitest";
import { canDelegate } from "@/lib/organization/authority";

// Phase 3.4, Part 12 — the delegation self-scoping safeguard. Pure
// logic, no DB — the real caller (validateDelegationAuthority) fetches
// a grantor's actual active grants and calls this directly.

describe("canDelegate", () => {
  it("Super Admin may delegate anything, including something they hold no grant for", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: true,
      grantorActiveGrants: [],
      requestedAuthority: "finance.payment_obligation.approve",
      requestedScopeDepartmentId: null,
    });
    expect(result).toEqual({ ok: true });
  });

  it("a non-Super-Admin cannot delegate a capability they do not hold", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "operations.administer", scopeDepartmentId: null }],
      requestedAuthority: "finance.payment_obligation.approve",
      requestedScopeDepartmentId: null,
    });
    expect(result.ok).toBe(false);
  });

  it("a non-Super-Admin CAN delegate a capability they actively hold, globally", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "operations.administer", scopeDepartmentId: null }],
      requestedAuthority: "operations.administer",
      requestedScopeDepartmentId: null,
    });
    expect(result).toEqual({ ok: true });
  });

  it("a department-scoped holder can delegate within that same department", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "people.recruitment.administer", scopeDepartmentId: "dept-finance" }],
      requestedAuthority: "people.recruitment.administer",
      requestedScopeDepartmentId: "dept-finance",
    });
    expect(result).toEqual({ ok: true });
  });

  it("a department-scoped holder cannot delegate into a DIFFERENT department (never sideways)", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "people.recruitment.administer", scopeDepartmentId: "dept-finance" }],
      requestedAuthority: "people.recruitment.administer",
      requestedScopeDepartmentId: "dept-creative",
    });
    expect(result.ok).toBe(false);
  });

  it("a department-scoped holder cannot delegate globally (never upward)", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "people.recruitment.administer", scopeDepartmentId: "dept-finance" }],
      requestedAuthority: "people.recruitment.administer",
      requestedScopeDepartmentId: null,
    });
    expect(result.ok).toBe(false);
  });

  it("a global holder MAY narrow a delegation to a single department", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "people.recruitment.administer", scopeDepartmentId: null }],
      requestedAuthority: "people.recruitment.administer",
      requestedScopeDepartmentId: "dept-finance",
    });
    expect(result).toEqual({ ok: true });
  });

  it("a non-Super-Admin can never delegate the standing tiers themselves (executive_admin, department_admin), even if held", () => {
    const executiveAdminResult = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "executive_admin", scopeDepartmentId: null }],
      requestedAuthority: "executive_admin",
      requestedScopeDepartmentId: null,
    });
    expect(executiveAdminResult.ok).toBe(false);

    const departmentAdminResult = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "department_admin", scopeDepartmentId: "dept-finance" }],
      requestedAuthority: "department_admin",
      requestedScopeDepartmentId: "dept-finance",
    });
    expect(departmentAdminResult.ok).toBe(false);
  });

  it("prevents privilege escalation: PRIME (operations.administer) cannot delegate VAULT's finance capability even by naming it directly", () => {
    const result = canDelegate({
      grantorIsSuperAdmin: false,
      grantorActiveGrants: [{ authority: "operations.administer", scopeDepartmentId: null }],
      requestedAuthority: "finance.payment_obligation.approve",
      requestedScopeDepartmentId: null,
    });
    expect(result.ok).toBe(false);
  });
});
