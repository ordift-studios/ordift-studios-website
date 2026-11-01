import { describe, expect, it } from "vitest";
import { calculateCorporateEstimate } from "@/lib/pricing/corporateHeadshotEstimate";
import { KNOWN_NOTICES } from "./merge";

// DISCREPANCY DETECTION (documentation, not a fix). Founder-approved policy: the corporate minimum (Ghana USD 250, Qatar USD 400) applies to the BASE charge of Individual, Executive and Team
// headshots, before add-ons. The quotation engine currently applies it to Team Headshots ONLY. This test pins today's behaviour so the gap stays visible; when the separate pricing release lands,
// these assertions MUST be updated deliberately, together with KNOWN_NOTICES in merge.ts. Round figures below are test inputs, not the selling table.
const rates = [{ marketId: "m", productSlug: "individual_headshot" as const, priceUsd: 100, signatureRetouchedImages: 2 }, { marketId: "m", productSlug: "executive_portrait" as const, priceUsd: 200, signatureRetouchedImages: 5 }];
const tiers = [{ marketId: "m", tierSlug: "2-5", minPeople: 2, maxPeople: 5, pricePerPersonUsd: 75 }];
const est = (product: "individual_headshot" | "executive_portrait" | "team_headshots", numberOfPeople?: number) => calculateCorporateEstimate({ product, headshotRates: rates, teamTierRates: tiers, minimumBookingUsd: 250, numberOfPeople });

describe("corporate minimum: current engine behaviour (known discrepancy with the approved policy)", () => {
  it("Team Headshots: the minimum is applied (3 × 75 = 225 → 250)", () => { const r = est("team_headshots", 3); expect(r.ok && r.basePriceUsd).toBe(250); expect(r.ok && r.minimumApplied).toBe(true); });
  it("Individual and Executive: the minimum is NOT applied today (base 100 and 200 stay below 250)", () => {
    for (const [p, base] of [["individual_headshot", 100], ["executive_portrait", 200]] as const) { const r = est(p); expect(r.ok && r.basePriceUsd).toBe(base); expect(r.ok && r.minimumApplied).toBe(false); }
  });
  it("the discrepancy is carried in every content report until it is fixed", () => { expect(KNOWN_NOTICES.join(" ")).toMatch(/Team Headshots only/); });
});
