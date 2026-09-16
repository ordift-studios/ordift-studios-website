import { describe, expect, it } from "vitest";
import { resolveVisibleNavItems } from "./navigation";
import type { CurrentUser, RoleSlug } from "./roles";

// Task 8 — cross-portal role/access regression QA (2026-09-16).
// Fixture users only, per explicit instruction — never Production
// people. Covers every one of the seven external/internal role slugs
// individually, dedup across staff/admin/super_admin, and the two
// capability-driven (non-role) additions, locking in the current
// role → visible-portal-link mapping so a future NAV_ITEMS change
// can't silently broaden or narrow what a role sees.

function userWith(roles: RoleSlug[]): CurrentUser {
  return { id: "fixture-user", email: "fixture@example.com", fullName: "Fixture User", roles, accessStatus: "active" };
}

describe("resolveVisibleNavItems — per-role visibility (fixtures only)", () => {
  it("client sees only My Bookings", () => {
    const items = resolveVisibleNavItems(userWith(["client"]), false, false);
    expect(items).toEqual([{ label: "My Bookings", href: "/portal/client" }]);
  });

  it("workshop_participant sees only My Workshops", () => {
    const items = resolveVisibleNavItems(userWith(["workshop_participant"]), false, false);
    expect(items).toEqual([{ label: "My Workshops", href: "/portal/workshops" }]);
  });

  it("model sees only My Profile", () => {
    const items = resolveVisibleNavItems(userWith(["model"]), false, false);
    expect(items).toEqual([{ label: "My Profile", href: "/portal/model" }]);
  });

  it("vendor sees only the Vendor link", () => {
    const items = resolveVisibleNavItems(userWith(["vendor"]), false, false);
    expect(items).toEqual([{ label: "Vendor", href: "/portal/vendor" }]);
  });

  it("contractor sees only My Projects — never the Vendor or Admin links", () => {
    const items = resolveVisibleNavItems(userWith(["contractor"]), false, false);
    expect(items).toEqual([{ label: "My Projects", href: "/portal/collaborator" }]);
  });

  it.each<RoleSlug>(["staff", "admin", "super_admin"])("%s sees only the Admin Platform link", (role) => {
    const items = resolveVisibleNavItems(userWith([role]), false, false);
    expect(items).toEqual([{ label: "Admin Platform", href: "/admin" }]);
  });

  it("a role with no NAV_ITEMS entry (none held) produces an empty list, never a fabricated link", () => {
    expect(resolveVisibleNavItems(userWith([]), false, false)).toEqual([]);
  });
});

describe("resolveVisibleNavItems — dedup across staff/admin/super_admin", () => {
  it("a dual staff+admin user sees exactly one Admin Platform link, not two", () => {
    const items = resolveVisibleNavItems(userWith(["staff", "admin"]), false, false);
    expect(items).toEqual([{ label: "Admin Platform", href: "/admin" }]);
  });

  it("a user holding all three internal roles still sees exactly one Admin Platform link", () => {
    const items = resolveVisibleNavItems(userWith(["staff", "admin", "super_admin"]), false, false);
    expect(items).toEqual([{ label: "Admin Platform", href: "/admin" }]);
  });

  it("an external role never collapses into the internal Admin Platform link", () => {
    const items = resolveVisibleNavItems(userWith(["client", "vendor"]), false, false);
    expect(items).toEqual([
      { label: "My Bookings", href: "/portal/client" },
      { label: "Vendor", href: "/portal/vendor" },
    ]);
  });
});

describe("resolveVisibleNavItems — isPayee / isInstructor are additive, never role-gated", () => {
  it("isPayee adds Payment Details after the role-derived items, for ANY role", () => {
    const items = resolveVisibleNavItems(userWith(["client"]), true, false);
    expect(items).toEqual([
      { label: "My Bookings", href: "/portal/client" },
      { label: "Payment Details", href: "/portal/payment-details" },
    ]);
  });

  it("isInstructor adds the Instructor link even for a role with no matching NAV_ITEMS entry", () => {
    const items = resolveVisibleNavItems(userWith(["staff"]), false, true);
    expect(items).toEqual([
      { label: "Admin Platform", href: "/admin" },
      { label: "Instructor", href: "/portal/instructor" },
    ]);
  });

  it("isPayee and isInstructor both true adds both, in a fixed order, on top of role-derived items", () => {
    const items = resolveVisibleNavItems(userWith(["contractor"]), true, true);
    expect(items).toEqual([
      { label: "My Projects", href: "/portal/collaborator" },
      { label: "Payment Details", href: "/portal/payment-details" },
      { label: "Instructor", href: "/portal/instructor" },
    ]);
  });

  it("neither flag never fabricates a link for a user with zero roles", () => {
    expect(resolveVisibleNavItems(userWith([]), false, false)).toEqual([]);
  });

  it("both flags true still work for a user with zero roles — capability facts are role-independent", () => {
    const items = resolveVisibleNavItems(userWith([]), true, true);
    expect(items).toEqual([
      { label: "Payment Details", href: "/portal/payment-details" },
      { label: "Instructor", href: "/portal/instructor" },
    ]);
  });
});
