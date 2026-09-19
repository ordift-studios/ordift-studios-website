import { describe, expect, it } from "vitest";
import { resolveVisibleAdminNavGroups, resolveVisibleAdminPortalLinks, type AdminNavFlags } from "./adminNavigation";
import type { CurrentUser, RoleSlug } from "./roles";

// Task 12 — Staff Role/Navigation/Route Security (2026-09-18). Fixture
// flags only, per instruction — never real Production people. This is
// the formal access-matrix regression suite: representative role
// combinations, asserting the SAME nav-visibility mapping the admin
// layout actually uses. Locks in the two real fixes from this batch
// (Payments/Content narrowed to admin-only) so they can't silently
// regress back to "shown to every staff member."

const NO_CAPABILITIES: AdminNavFlags = {
  isAdmin: false,
  isSuper: false,
  isExecutive: false,
  isWorkforceAdmin: false,
  canCoordinateOperations: false,
  canAdministerPartnerships: false,
};

function findItem(groups: ReturnType<typeof resolveVisibleAdminNavGroups>, href: string) {
  return groups.flatMap((g) => g.items).find((i) => i.href === href);
}

describe("resolveVisibleAdminNavGroups — plain staff (Kelvin's real category, fixture)", () => {
  const groups = resolveVisibleAdminNavGroups(NO_CAPABILITIES);

  it("sees My Workspace and the ungated Overview/Activity/Workshop/Portfolio links", () => {
    expect(findItem(groups, "/admin/me")).toBeDefined();
    expect(findItem(groups, "/admin/overview")).toBeDefined();
    expect(findItem(groups, "/admin/activity")).toBeDefined();
    expect(findItem(groups, "/admin/workshops")).toBeDefined();
    expect(findItem(groups, "/admin/portfolio")).toBeDefined();
  });

  it("does NOT see Payments — the real Kelvin exposure this batch closed", () => {
    expect(findItem(groups, "/admin/payments")).toBeUndefined();
  });

  it("does NOT see Content — the real Sanity Studio exposure this batch closed", () => {
    expect(findItem(groups, "/admin/content")).toBeUndefined();
  });

  it("does NOT see Production Operations or Partnerships without the specific capability", () => {
    expect(findItem(groups, "/admin/production")).toBeUndefined();
    expect(findItem(groups, "/admin/partnerships")).toBeUndefined();
  });

  it("does NOT see any admin-only, super-admin-only, executive-only, or workforce-admin-only route", () => {
    expect(findItem(groups, "/admin/hr")).toBeUndefined();
    expect(findItem(groups, "/admin/recruitment")).toBeUndefined();
    expect(findItem(groups, "/admin/organization")).toBeUndefined();
    expect(findItem(groups, "/admin/legal")).toBeUndefined();
    expect(findItem(groups, "/admin/authority")).toBeUndefined();
    expect(findItem(groups, "/admin/executive")).toBeUndefined();
    expect(findItem(groups, "/admin/users")).toBeUndefined();
    expect(findItem(groups, "/admin/team")).toBeUndefined();
  });

  it("the Creative & Production group is dropped entirely (its one item is hidden) — never an empty group heading", () => {
    expect(groups.find((g) => g.label === "Creative & Production")).toBeUndefined();
  });
});

describe("resolveVisibleAdminNavGroups — admin role", () => {
  const groups = resolveVisibleAdminNavGroups({ ...NO_CAPABILITIES, isAdmin: true });

  it("sees every adminOnly route, including the now-narrowed Payments and Content", () => {
    expect(findItem(groups, "/admin/payments")).toBeDefined();
    expect(findItem(groups, "/admin/content")).toBeDefined();
    expect(findItem(groups, "/admin/hr")).toBeDefined();
    expect(findItem(groups, "/admin/recruitment")).toBeDefined();
    expect(findItem(groups, "/admin/legal")).toBeDefined();
  });

  it("still does NOT see superAdminOnly, executiveOnly, workforceAdminOnly, or the two capability-gated routes", () => {
    expect(findItem(groups, "/admin/authority")).toBeUndefined();
    expect(findItem(groups, "/admin/team")).toBeUndefined();
    expect(findItem(groups, "/admin/executive")).toBeUndefined();
    expect(findItem(groups, "/admin/users")).toBeUndefined();
    expect(findItem(groups, "/admin/production")).toBeUndefined();
    expect(findItem(groups, "/admin/partnerships")).toBeUndefined();
  });
});

describe("resolveVisibleAdminNavGroups — super_admin sees everything", () => {
  const groups = resolveVisibleAdminNavGroups({
    isAdmin: true,
    isSuper: true,
    isExecutive: true,
    isWorkforceAdmin: true,
    canCoordinateOperations: true,
    canAdministerPartnerships: true,
  });

  it("sees every single nav item across every group, with no empty groups", () => {
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
    }
    expect(findItem(groups, "/admin/authority")).toBeDefined();
    expect(findItem(groups, "/admin/production")).toBeDefined();
    expect(findItem(groups, "/admin/partnerships")).toBeDefined();
    expect(findItem(groups, "/admin/users")).toBeDefined();
  });
});

describe("resolveVisibleAdminNavGroups — a genuinely-granted capability adds exactly that item, nothing else", () => {
  it("canCoordinateOperations alone reveals Production Operations only, not Partnerships or any admin-only route", () => {
    const groups = resolveVisibleAdminNavGroups({ ...NO_CAPABILITIES, canCoordinateOperations: true });
    expect(findItem(groups, "/admin/production")).toBeDefined();
    expect(findItem(groups, "/admin/partnerships")).toBeUndefined();
    expect(findItem(groups, "/admin/payments")).toBeUndefined();
  });

  it("canAdministerPartnerships alone reveals Partnerships only, not Production", () => {
    const groups = resolveVisibleAdminNavGroups({ ...NO_CAPABILITIES, canAdministerPartnerships: true });
    expect(findItem(groups, "/admin/partnerships")).toBeDefined();
    expect(findItem(groups, "/admin/production")).toBeUndefined();
  });
});

function userWith(roles: RoleSlug[]): CurrentUser {
  return { id: "fixture-user", email: "fixture@example.com", fullName: "Fixture User", roles, accessStatus: "active" };
}

describe("resolveVisibleAdminPortalLinks — dual-role staff cross-link (fixtures only)", () => {
  it("a staff account with no other role sees no portal cross-links", () => {
    expect(resolveVisibleAdminPortalLinks(userWith(["staff"]))).toEqual([]);
  });

  it("a staff account that is also a vendor sees the Vendor Portal link", () => {
    expect(resolveVisibleAdminPortalLinks(userWith(["staff", "vendor"]))).toEqual([{ label: "Vendor Portal", href: "/portal/vendor" }]);
  });
});
