import { describe, expect, it } from "vitest";
import { getRecommendationsFor, recommendationHref } from "./crossServiceRecommendations";

// Ordift Cross-Service Recommendation Foundation (2026-09-07) —
// proves the registry is purely descriptive/navigational: it never
// carries a price, never computes anything, and is capped so a
// consuming page can never render an unrestrained wall of upsells.

describe("getRecommendationsFor", () => {
  it("returns Graphic Design's approved recommendations", () => {
    const recs = getRecommendationsFor("graphic_design");
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.fromFamily === "graphic_design")).toBe(true);
  });

  it("caps recommendations at a small, restrained number (never a wall of upsells)", () => {
    const recs = getRecommendationsFor("graphic_design");
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it("returns an empty list for a family with no registered recommendations yet", () => {
    expect(getRecommendationsFor("branding")).toEqual([]);
    expect(getRecommendationsFor("talent_management")).toEqual([]);
  });

  it("15. no recommendation entry carries a price field of any kind — cross-service recommendations never alter the originating price", () => {
    const recs = getRecommendationsFor("graphic_design");
    for (const r of recs) {
      expect(r).not.toHaveProperty("priceUsd");
      expect(r).not.toHaveProperty("amountUsd");
      expect(r).not.toHaveProperty("discountPercentage");
    }
  });

  it("16. discountEligible is never set to true for any current entry — no automatic discount is created by a recommendation", () => {
    const recs = getRecommendationsFor("graphic_design");
    for (const r of recs) {
      expect(r.discountEligible).not.toBe(true);
    }
  });
});

describe("recommendationHref", () => {
  it("builds a pricing-family link for pricing_family destinations", () => {
    const recs = getRecommendationsFor("graphic_design");
    const personalRec = recs.find((r) => r.destination.kind === "pricing_family" && r.destination.family === "personal");
    expect(personalRec).toBeDefined();
    if (!personalRec) return;
    expect(recommendationHref(personalRec)).toBe("/pricing?family=personal");
  });

  it("builds a department link for department destinations", () => {
    const recs = getRecommendationsFor("graphic_design");
    const departmentRec = recs.find((r) => r.destination.kind === "department");
    expect(departmentRec).toBeDefined();
    if (!departmentRec || departmentRec.destination.kind !== "department") return;
    expect(recommendationHref(departmentRec)).toBe(`/services/${departmentRec.destination.slug}`);
  });
});
