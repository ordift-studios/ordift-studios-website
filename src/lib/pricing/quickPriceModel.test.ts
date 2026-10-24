import { describe, expect, it } from "vitest";
import { buildClientSummary, captureFromHref, compareOptions, discountState, previewDiscount, type Captured } from "./quickPriceModel";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";

const href = (title: string, lines: string[], family: "personal" | "production_services" = "personal") => `/book?service=photography&pricing=${encodePricingHandoff({ family, pathway: "photography", summaryTitle: title, summaryLines: lines })}`;
const A = captureFromHref(href("Personal Portrait — 2h, Individual", ["Market: Qatar / GCC", "Session length: 2h", "Outfits/looks: 2", "Total: $450.00"]));
const B = captureFromHref(href("Personal Portrait — 1h, Individual", ["Market: Qatar / GCC", "Session length: 1h", "Outfits/looks: 1", "Total: $300.00"]));

describe("reading the governed estimators' results", () => {
  it("reads the title, lines and total from the same handoff each estimator already builds", () => {
    expect(A).toMatchObject({ status: "priced", totalUsd: 450, title: "Personal Portrait — 2h, Individual" });
    expect(captureFromHref(href("Wedding", ["Estimated Total: $1,234.50"]))).toMatchObject({ status: "priced", totalUsd: 1234.5 });
  });
  it("a selection the estimator cannot price (no handoff) is UNPRICED - never zero", () => {
    expect(captureFromHref("/book?service=photography")).toMatchObject({ status: "unpriced" });
    expect(captureFromHref(null)).toMatchObject({ status: "unpriced" });
    expect(captureFromHref("/book?pricing=garbage")).toMatchObject({ status: "unpriced" });
  });
  it("an indicative fee (Production Services) is not treated as a total", () => {
    expect(captureFromHref(href("Production", ["Ordift Fee (indicative): $2,000.00"], "production_services"))).toMatchObject({ status: "indicative", totalUsd: 2000 });
  });
  it("a handoff with no total line is unpriced", () => expect(captureFromHref(href("X", ["Market: Ghana"]))).toMatchObject({ status: "unpriced" }));
});

describe("comparing options", () => {
  it("shows the difference and what the client gives up or gains - not a proportional guess", () => {
    const c = compareOptions(A, B);
    expect(c).toMatchObject({ differenceUsd: -150, direction: "lower" });
    expect(c.onlyInOriginal).toEqual(["Session length: 2h", "Outfits/looks: 2"]);
    expect(c.onlyInRevised).toEqual(["Session length: 1h", "Outfits/looks: 1"]);
    expect(150 / 450).not.toBeCloseTo(0.5); // the estimator's own pricing is used, not time/quantity scaling
  });
  it("is unknown when either side is unpriced or indicative, never a made-up difference", () => {
    const u: Captured = { status: "unpriced", reason: "x" };
    expect(compareOptions(A, u)).toMatchObject({ differenceUsd: null, direction: "unknown" });
    const ind = captureFromHref(href("P", ["Ordift Fee (indicative): $10.00"], "production_services"));
    expect(compareOptions(A, ind).differenceUsd).toBeNull();
  });
  it("identical options show no difference", () => expect(compareOptions(A, A)).toMatchObject({ differenceUsd: 0, direction: "same" }));
});

describe("discount PREVIEW (never an approval)", () => {
  const ok = { reason: "Returning client, agreed by the Founder." };
  it("percentage and fixed previews use the existing discount arithmetic", () => {
    expect(previewDiscount(A, { type: "percentage", value: 10, ...ok })).toEqual({ ok: true, eligibleSubtotalUsd: 450, discountUsd: 45, totalUsd: 405 });
    expect(previewDiscount(A, { type: "fixed", value: 50, ...ok })).toEqual({ ok: true, eligibleSubtotalUsd: 450, discountUsd: 50, totalUsd: 400 });
  });
  it("refuses invalid percentages, non-positive values, a total of zero or less, a missing reason, and unpriced/indicative options", () => {
    for (const bad of [{ type: "percentage" as const, value: 100 }, { type: "percentage" as const, value: 150 }, { type: "percentage" as const, value: 0 }, { type: "fixed" as const, value: -5 }, { type: "fixed" as const, value: 450 }, { type: "fixed" as const, value: 900 }])
      expect(previewDiscount(A, { ...bad, ...ok }).ok).toBe(false);
    expect(previewDiscount(A, { type: "percentage", value: 10, reason: "short" }).ok).toBe(false);
    expect(previewDiscount({ status: "unpriced", reason: "x" }, { type: "percentage", value: 10, ...ok }).ok).toBe(false);
    expect(previewDiscount(captureFromHref(href("P", ["Ordift Fee (indicative): $10.00"], "production_services")), { type: "percentage", value: 10, ...ok }).ok).toBe(false);
  });
  it("staff only PROPOSE; a Super Admin preview still has to be confirmed in the formal quotation; neither is called approved", () => {
    const p = previewDiscount(A, { type: "percentage", value: 10, ...ok });
    expect(discountState(p, false)).toBe("proposed_needs_approval");
    expect(discountState(p, true)).toBe("preview_confirm_in_quotation");
    expect(discountState(null, true)).toBe("none");
  });
});

describe("the client summary", () => {
  const disc = previewDiscount(B, { type: "percentage", value: 10, reason: "Returning client, agreed by the Founder." });
  it("keeps a scope change separate from a discount and words the discount as proposed", () => {
    const t = buildClientSummary(B, { label: "Option B", original: A, originalLabel: "Option A", discount: disc, discountInput: { type: "percentage", value: 10, reason: "x" } });
    expect(t).toContain("Estimated total: $300.00 USD");
    expect(t).toContain("Change in scope from Option A: −$150.00 USD (a change in what is included, not a discount)");
    expect(t).toContain("Proposed discount: −$30.00 USD (10%; subject to Ordift approval)");
    expect(t).toContain("Estimated total after proposed discount: $270.00 USD");
    expect(t).toContain("estimate, not a formal quotation");
    expect(t.indexOf("Change in scope")).toBeLessThan(t.indexOf("Proposed discount"));
  });
  it("has no discount lines without a valid preview, and is empty for an unpriced option", () => {
    expect(buildClientSummary(A, { label: "Option A" })).not.toContain("discount");
    expect(buildClientSummary({ status: "unpriced", reason: "x" }, { label: "Option A" })).toBe("");
  });
});
