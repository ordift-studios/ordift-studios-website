// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import PricingAreas, { RATE_CARD_HREF } from "./PricingAreas";

describe("Pricing page → Rate Card access", () => {
  it("shows Service Pricing (current) and a Rate Card card linking to the existing builder, for Super Admin", () => {
    const html = renderToStaticMarkup(createElement(PricingAreas, { showRateCard: true }));
    expect(RATE_CARD_HREF).toBe("/admin/pricing/rate-card");
    expect(html).toContain('href="/admin/pricing/rate-card"'); expect(html).toContain("Open the Rate Card Builder");
    expect(html).toContain('aria-current="page"'); expect(html).toContain("Service Pricing");
    for (const t of ["Create a rate card draft", "open saved drafts", "preview and download draft PDFs", "approval status and approved editions"]) expect(html).toContain(t);
  });
  it("renders nothing for anyone who is not Super Admin (the builder is Super Admin only)", () => { expect(renderToStaticMarkup(createElement(PricingAreas, { showRateCard: false }))).toBe(""); });
  it("the Pricing page renders it for Super Admin only, ahead of the existing tab navigation, and its access check is unchanged", () => {
    const src = readFileSync(path.join(__dirname, "page.tsx"), "utf8");
    expect(src).toContain("<PricingAreas showRateCard={isSuperAdmin(user)} />");
    expect(src.indexOf("<PricingAreas")).toBeLessThan(src.indexOf("<TabNav active={tab} />"));
    expect(src).toContain("authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.pricingAdminister)");
  });
  it("the builder page still requires Super Admin and offers a way back to Pricing", () => {
    const src = readFileSync(path.join(__dirname, "rate-card", "page.tsx"), "utf8");
    expect(src).toContain("if (!user || !isSuperAdmin(user)) redirect(");
    expect(src).toContain('href="/admin/pricing"');
  });
});
