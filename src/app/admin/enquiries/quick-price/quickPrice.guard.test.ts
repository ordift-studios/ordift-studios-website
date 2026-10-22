import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Enquiries & Quick Pricing is staff-only, read-only and shares the public rate loader", () => {
  const page = read("./page.tsx");
  it("refuses anyone who is not staff or admin before loading any pricing data", () => {
    expect(page.indexOf("isStaffOrAdmin(user)")).toBeGreaterThan(-1);
    expect(page.indexOf("PricingEstimatorPanel family")).toBeGreaterThan(page.indexOf("isStaffOrAdmin(user)"));
    expect(page).toContain('redirect("/admin/overview")');
  });
  it("creates and sends nothing: no server actions, writes, emails or fetches in the page or the summary builder", () => {
    for (const src of [page, read("./ClientSummaryBuilder.tsx")])
      for (const bad of ["use server", ".insert(", ".update(", ".upsert(", ".delete(", "sendEmail", "fetch(", "createAdminClient"]) expect(src).not.toContain(bad);
  });
  it("uses the same panel (one rate loader) as the public pricing page, so staff and customers see the same governed rates", () => {
    expect(read("../../../pricing/page.tsx")).toContain("PricingEstimatorPanel");
    expect(page).toContain("@/app/pricing/PricingEstimatorPanel");
    const panel = read("../../../pricing/PricingEstimatorPanel.tsx");
    expect(panel).toContain("getActivePersonalSessionRates");
    for (const bad of [".insert(", ".update(", ".upsert(", ".delete("]) expect(panel).not.toContain(bad);
  });
  it("states that an estimate is not a quotation and that nothing is saved or sent", () => {
    expect(page).toContain("an estimate is not a quotation");
    expect(read("./ClientSummaryBuilder.tsx")).toContain("This is an estimate, not a formal quotation");
  });
});
