import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS, resolveVisibleAdminNavGroups, type AdminNavFlags } from "./adminNavigation";

// The Instructor Management section must be VISIBLE in the dashboard menu (a working direct URL is not enough), for Super Admin only, and every entry must point at a real page.
const flags = (o: Partial<AdminNavFlags>): AdminNavFlags => ({ isAdmin: false, isSuper: false, isExecutive: false, isWorkforceAdmin: false, canCoordinateOperations: false, canAdministerPartnerships: false, ...o });
const group = (f: AdminNavFlags) => resolveVisibleAdminNavGroups(f).find((g) => g.label === "Instructor Management");

describe("Instructor Management navigation", () => {
  it("a Super Admin sees the section with its four entries, in order", () => {
    const g = group(flags({ isSuper: true, isAdmin: true }));
    expect(g?.items.map((i) => i.label)).toEqual(["Instructor Directory / Onboarding", "Instructor Standards", "Session Schedule / Assignments", "Rights Matrix"]);
    expect(g?.items.map((i) => i.href)).toEqual(["/admin/organization/instructors", "/admin/organization/instructor-standards", "/admin/organization/instructor-assignments", "/admin/organization/instructor-assignments#rights-matrix"]);
  });
  it("nobody else sees it: not an admin, not a workforce or operations administrator, not staff", () => {
    for (const f of [flags({ isAdmin: true }), flags({ isAdmin: true, isWorkforceAdmin: true, canCoordinateOperations: true, isExecutive: true }), flags({})]) expect(group(f)).toBeUndefined();
  });
  it("the section sits near the START of the menu (right after HR / People), so it is visible without scrolling the bar", () => {
    const labels = ADMIN_NAV_GROUPS.map((g) => g.label);
    expect(labels.indexOf("Instructor Management")).toBe(labels.indexOf("HR / People") + 1);
    expect(labels.indexOf("Instructor Management")).toBeLessThan(4);
  });
  it("there is exactly one such section (no duplicate), and every entry points at an existing page", () => {
    expect(ADMIN_NAV_GROUPS.filter((g) => g.label === "Instructor Management")).toHaveLength(1);
    for (const i of ADMIN_NAV_GROUPS.find((g) => g.label === "Instructor Management")!.items) {
      const path = i.href.split("#")[0].replace(/^\//, "");
      expect(existsSync(join(process.cwd(), "src/app", path, "page.tsx")), i.href).toBe(true);
    }
  });
});
