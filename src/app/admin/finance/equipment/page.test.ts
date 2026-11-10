// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, superAdmin: false }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isSuperAdmin: () => h.superAdmin }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/organization/legalEntities", () => ({ listEmployingEntities: async () => [
  { id: "e-qa", name: "Entity (Qatar)", legalName: "ENTITY LEGAL", jurisdictionName: "Qatar" }, { id: "e-gh", name: "Entity (Ghana)", legalName: null, jurisdictionName: "Ghana" }] }));
import Page from "./page";

beforeEach(() => { h.user = { id: "u" }; h.superAdmin = true; });
describe("/admin/finance/equipment", () => {
  it("sends anyone who is not a Super Admin away before listing anything", async () => {
    h.superAdmin = false;
    await expect(Page()).rejects.toThrow("REDIRECT:/admin/overview");
    h.user = null;
    await expect(Page()).rejects.toThrow("REDIRECT:/admin/overview");
  });
  it("lists each legal entity with a link to its own Equipment & Financing panel and states the module's scope", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('href="/admin/organization/legal-entities/e-qa/equipment"');
    expect(html).toContain('href="/admin/organization/legal-entities/e-gh/equipment"');
    expect(html).toMatch(/not a full accounting dashboard/); expect(html).toMatch(/never bank-reconciled/);
  });
});
