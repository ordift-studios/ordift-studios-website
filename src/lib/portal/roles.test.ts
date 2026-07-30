import { describe, expect, it } from "vitest";
import { hasRole, isStaffOrAdmin, isSuperAdmin, primaryPortalPath, type CurrentUser, type RoleSlug } from "./roles";

function userWith(roles: RoleSlug[]): CurrentUser {
  return { id: "u1", email: "u1@example.com", fullName: "Test User", roles, accessStatus: "active" };
}

describe("hasRole", () => {
  it("returns true when the user holds the role", () => {
    expect(hasRole(userWith(["client"]), "client")).toBe(true);
  });

  it("returns false when the user does not hold the role", () => {
    expect(hasRole(userWith(["client"]), "admin")).toBe(false);
  });

  it("returns false for a null user", () => {
    expect(hasRole(null, "client")).toBe(false);
  });

  it("supports a user holding multiple roles at once", () => {
    const user = userWith(["client", "workshop_participant"]);
    expect(hasRole(user, "client")).toBe(true);
    expect(hasRole(user, "workshop_participant")).toBe(true);
    expect(hasRole(user, "admin")).toBe(false);
  });
});

describe("isStaffOrAdmin", () => {
  it.each<RoleSlug>(["staff", "admin", "super_admin"])("returns true for %s", (role) => {
    expect(isStaffOrAdmin(userWith([role]))).toBe(true);
  });

  it.each<RoleSlug>(["client", "workshop_participant", "model", "vendor", "contractor"])(
    "returns false for %s",
    (role) => {
      expect(isStaffOrAdmin(userWith([role]))).toBe(false);
    }
  );

  it("returns false for a null user", () => {
    expect(isStaffOrAdmin(null)).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  it("returns true only for super_admin, not plain admin", () => {
    expect(isSuperAdmin(userWith(["super_admin"]))).toBe(true);
    expect(isSuperAdmin(userWith(["admin"]))).toBe(false);
  });
});

describe("primaryPortalPath", () => {
  // Locks in the documented most-privileged-first precedence order —
  // a regression here would silently misroute a real user on login.
  it("routes super_admin to /admin even if they also hold other roles", () => {
    expect(primaryPortalPath(["client", "super_admin"])).toBe("/admin");
  });

  it("routes admin to /admin", () => {
    expect(primaryPortalPath(["admin"])).toBe("/admin");
  });

  it("routes staff to /admin, not the customer-facing portal", () => {
    expect(primaryPortalPath(["staff", "client"])).toBe("/admin");
  });

  it("routes contractor to the collaborator portal, never /admin", () => {
    expect(primaryPortalPath(["contractor"])).toBe("/portal/collaborator");
  });

  it("routes vendor to the vendor portal", () => {
    expect(primaryPortalPath(["vendor"])).toBe("/portal/vendor");
  });

  it("routes model to the model portal", () => {
    expect(primaryPortalPath(["model"])).toBe("/portal/model");
  });

  it("routes workshop_participant to /portal/workshops when that's the only role", () => {
    expect(primaryPortalPath(["workshop_participant"])).toBe("/portal/workshops");
  });

  it("falls back to /portal/client for a plain client", () => {
    expect(primaryPortalPath(["client"])).toBe("/portal/client");
  });

  it("falls back to /portal/client for no roles at all", () => {
    expect(primaryPortalPath([])).toBe("/portal/client");
  });

  it("prefers admin over contractor when a user somehow holds both", () => {
    expect(primaryPortalPath(["contractor", "admin"])).toBe("/admin");
  });
});
