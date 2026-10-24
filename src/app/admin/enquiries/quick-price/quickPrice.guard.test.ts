import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Enquiries & Quick Pricing is staff-only, read-only and shares the public rate loader", () => {
  const page = read("./page.tsx");
  it("refuses anyone who is not staff or admin before loading any pricing data", () => {
    expect(page.indexOf("isStaffOrAdmin(user)")).toBeGreaterThan(-1);
    expect(page.indexOf("<PricingEstimatorPanel key")).toBeGreaterThan(page.indexOf("isStaffOrAdmin(user)"));
    expect(page).toContain('redirect("/admin/overview")');
  });
  it("creates and sends nothing: no server actions, writes, emails or fetches in the page or the summary builder", () => {
    for (const src of [page, read("./PriceNegotiationWorkspace.tsx")])
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
    expect(read("../../../../lib/pricing/quickPriceModel.ts")).toContain("This is an estimate, not a formal quotation");
  });
  it("the workspace adds no pricing engine and persists nothing: it reads the estimators' own results, reuses applyDiscount, and never touches storage or the network", () => {
    const ws = read("./PriceNegotiationWorkspace.tsx");
    const model = read("../../../../lib/pricing/quickPriceModel.ts");
    expect(model).toContain('import { applyDiscount } from "./discountMath"');
    expect(model).toContain("decodePricingHandoff");
    for (const bad of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "XMLHttpRequest"]) expect(ws).not.toContain(bad);
    expect(ws).toContain("overflow-x-auto"); // the comparison table scrolls instead of overflowing on a phone
    expect(ws).toContain("Founder / Super Admin approval");
    expect(ws).toContain("No percentage or amount limit has been set");
  });
  it("saving is available only behind the persistence gate, and says nothing is sent", async () => {
    const { default: Workspace } = await import("./PriceNegotiationWorkspace");
    const props = { isSuperAdmin: false, fx: { QAR: null, GHS: null }, slots: [createElement("p", { key: 1 }, "a"), createElement("p", { key: 2 }, "b"), createElement("p", { key: 3 }, "c")] };
    expect(renderToStaticMarkup(createElement(Workspace, props))).not.toContain("Save as communicated");
    const on = renderToStaticMarkup(createElement(Workspace, { ...props, persistence: true, family: "wedding_event" }));
    expect(on).toContain("Save as communicated to an enquiry");
    expect(on).toContain("Nothing is sent to the client");
    expect(read("./PriceNegotiationWorkspace.tsx")).toContain("{persistence && (");
    expect(read("../../../../lib/enquiry/pricingHistory.ts")).toContain("ENQUIRY_PRICING_PERSISTENCE_ENABLED = false");
  });
  it("renders for staff and for a Super Admin with the three options, the compare area and the approval boundary (mobile-first markup)", async () => {
    const { default: Workspace } = await import("./PriceNegotiationWorkspace");
    for (const superAdmin of [false, true]) {
      const html = renderToStaticMarkup(createElement(Workspace, { isSuperAdmin: superAdmin, fx: { QAR: { rateToUsd: 3.64, effectiveFrom: "2026-10-11T00:00:00Z" }, GHS: null }, slots: [createElement("p", { key: 1 }, "calc A"), createElement("p", { key: 2 }, "calc B"), createElement("p", { key: 3 }, "calc C")] }));
      expect(html).toContain("Option A — original");
      expect(html).toContain("Option B — revised");
      expect(html).toContain("Compare");
      expect(html).toContain("A USD amount is never relabelled as QAR or GHS");
      expect(html).toContain("not</strong> added to the client summary");
      expect(html).toContain(superAdmin ? "this page records no approval" : "you cannot authorise it");
      expect(html).toContain("grid-cols-3"); // tab row fits a phone
    }
  });
  it("the internal local-currency reference never reaches the client summary", () => {
    const ws = read("./PriceNegotiationWorkspace.tsx");
    const start = ws.indexOf("buildClientSummary(chosen");
    const call = ws.slice(start, ws.indexOf("\n", start));
    expect(call).not.toMatch(/refLocal|refCurrency|indicative/);
    expect(read("../../../../lib/pricing/quickPriceModel.ts")).not.toMatch(/QAR|GHS/);
  });
  it("the database-dependent layers stay switched off until each is separately activated, whatever the migration state", () => {
    const flag = (f: string, name: string) => expect(readFileSync(new URL(f, import.meta.url), "utf8")).toMatch(new RegExp(`${name} = false;`));
    flag("../../../../lib/enquiry/pricingHistory.ts", "ENQUIRY_PRICING_PERSISTENCE_ENABLED");
    flag("../../../../lib/portfolio/featureGate.ts", "PORTFOLIO_LIBRARY_ENABLED");
    flag("../../../../lib/portfolio/permissionText.ts", "PERMISSION_TEXT_APPROVED");
  });
});
