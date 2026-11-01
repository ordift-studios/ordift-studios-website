// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS } from "@/lib/portal/adminNavigation";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { PERMISSION_TEXT_APPROVED } from "./permissionText";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const PREVIEW = "src/lib/portfolio/editionPreview.ts";
const ROUTE = "src/app/admin/portfolio/editions/preview/route.ts";
const PAGE = "src/app/admin/portfolio/editions/page.tsx";

describe("portfolio internal administration (library on, client wording off)", () => {
  it("the library is on for internal administration while the client permission wording is still unapproved", () => {
    expect(PORTFOLIO_LIBRARY_ENABLED).toBe(true);
    expect(PERMISSION_TEXT_APPROVED).toBe(false);
    expect(read("src/lib/portfolio/library.ts")).toMatch(/if \(!PERMISSION_TEXT_APPROVED\) return fail\(/);
    expect(read("src/app/portal/(dashboard)/permissions/page.tsx")).toContain("if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_TEXT_APPROVED) notFound();");
  });
  it("the preview can only be internal: fixed mode, no external path, no storage write, publish, share or email", () => {
    const src = read(PREVIEW), route = read(ROUTE), page = read(PAGE);
    expect(src).toContain('mode: "internal_preview"');
    for (const [name, t] of [["preview", src], ["route", route], ["page", page]] as const) {
      expect(t, name).not.toMatch(/external_edition|recordUse|createPermissionRequest|\.upload\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|createSignedUrl|sendEmail|resend|fetch\(/i);
    }
    expect(src).toMatch(/storage\.from\([^)]*\)\.download\(/); // read-only
  });
  it("the route and page are Super Admin only and answer not-found/redirect otherwise", () => {
    expect(read(ROUTE)).toContain("!isSuperAdmin(user)");
    expect(read(PAGE)).toContain("!isSuperAdmin(user)");
    expect(read(ROUTE)).toContain("no-store");
  });
  it("the page is reachable from Content & Website for a Super Admin only, matching the page's own check", () => {
    const g = ADMIN_NAV_GROUPS.find((x) => x.label === "Content & Website");
    const item = g?.items.find((i) => i.href === "/admin/portfolio/editions");
    expect(item?.superAdminOnly).toBe(true);
  });
});
