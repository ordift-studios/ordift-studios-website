import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("./page.tsx");
const picker = read("./PortfolioPicker.tsx");
const source = read("../../../../../lib/portfolio/sourceFiles.ts");

describe("Quick Portfolio Picker is internal, management-only and read-only", () => {
  it("requires staff, then management, before any job photograph is listed", () => {
    expect(page.indexOf("isStaffOrAdmin(user)")).toBeGreaterThan(-1);
    expect(page.indexOf("isManagementUser(user)")).toBeGreaterThan(page.indexOf("isStaffOrAdmin(user)"));
    expect(page.indexOf("listPortfolioSourceFiles(")).toBeGreaterThan(page.indexOf("isManagementUser(user)"));
    expect(page).toContain("allowed ?");
    expect(page).toContain("robots: { index: false");
  });
  it("writes nothing: no inserts, updates, uploads, storage copies or server actions of its own", () => {
    for (const src of [page, picker, source])
      for (const bad of [".insert(", ".update(", ".upsert(", ".delete(", ".upload(", ".copy(", "use server", "sendEmail", "createSignedUrl", "getPublicUrl", "localStorage"]) expect(src).not.toContain(bad);
  });
  it("offers the three browsing modes and builds the job list from real job records", () => {
    for (const label of ["Final Images", "Jobs & Projects", "Portfolio Collections"]) expect(page).toContain(label);
    expect(source).toContain("crew_support_requests");
    expect(source).not.toMatch(/invent|fixture|sample job/i);
    expect(page).toContain("getPortfolioCategories");
  });
  it("only reads project_files / job tables and excludes purged files", () => {
    expect(source).toContain('.is("purged_at", null)');
    expect(source).not.toMatch(/\.from\("(portfolio|storage)/);
  });
  it("previews go through the existing access-checked signed-link action, never a public URL", () => {
    expect(picker).toContain("previewUrlsAction");
    expect(picker).not.toMatch(/https?:\/\//);
  });
  it("labels every photograph as not cleared and never claims clearance", () => {
    expect(source).toContain('clearance: "not_cleared"');
    expect(picker).toContain("Not cleared for marketing");
    expect(page).toContain("Two separate approvals are needed");
    expect(page).toContain("PORTFOLIO_LIBRARY_ENABLED");
    expect(picker).not.toMatch(/\bcleared for use\b|Cleared\b/);
  });
  it("puts Final images first and keeps the full Portfolio administration separate", () => {
    expect(source).toContain('b.kind === "final_approved"');
    expect(page).toContain('href="/admin/portfolio"');
  });
  it("the Quick Pricing page opens it in a new tab so the calculation is not lost", () => {
    const qp = read("../page.tsx");
    expect(qp).toContain('href="/admin/enquiries/quick-price/portfolio" target="_blank"');
  });
  it("the tray is temporary and its copied list carries the not-cleared warning", () => {
    expect(picker).toContain("lives only in this tab");
    expect(picker).toContain("sessionStorage");   // this tab only, never localStorage
    expect(picker).toContain("never images or links");
    expect(picker).toContain("NOT CLEARED for marketing");
  });
});
