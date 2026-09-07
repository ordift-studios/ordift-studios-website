import { describe, expect, it } from "vitest";
import { encodePricingHandoff, decodePricingHandoff, pricingHandoffFamilyLabel, type PricingHandoff } from "./pricingHandoff";

// Ordift Booking Journey Refinement (2026-09-07) — encode/decode must
// round-trip exactly for every pricing family, must never throw on
// malformed/tampered/oversized input (client-submitted data is never
// trusted), and must never be treated as authoritative pricing — these
// tests only prove the descriptive-summary encoding itself works.

describe("encodePricingHandoff / decodePricingHandoff — round-trip", () => {
  const cases: PricingHandoff[] = [
    { family: "personal", pathway: "photography", summaryTitle: "Personal Portrait — 2h, Couple", summaryLines: ["Market: Ghana / West Africa", "Session length: 2h", "Total: $225.00"] },
    { family: "corporate", pathway: "photography", summaryTitle: "Corporate & Headshots — Executive Portrait", summaryLines: ["Market: Qatar / GCC", "Total: $300.00"] },
    { family: "wedding_event", pathway: "photography", summaryTitle: "Wedding Celebrations — The Narrative", summaryLines: ["Market: UK / Western Europe", "Service: Photography + Film", "Total: $3,400.00"] },
    { family: "wedding_event", pathway: "videography", summaryTitle: "Events — Full Day (Film)", summaryLines: ["Market: Ghana / West Africa", "Total: $700.00"] },
    { family: "commercial", pathway: "photography", summaryTitle: "Commercial / Advertising", summaryLines: ["Market: North America", "Estimated Commercial Investment: $30,325.00", "Custom Commercial Proposal Required"] },
  ];

  for (const handoff of cases) {
    it(`round-trips ${handoff.family}/${handoff.pathway}`, () => {
      const encoded = encodePricingHandoff(handoff);
      expect(encoded.length).toBeGreaterThan(0);
      const decoded = decodePricingHandoff(encoded);
      expect(decoded).toEqual(handoff);
    });
  }
});

describe("decodePricingHandoff — never throws on malformed/tampered input", () => {
  it("returns null for undefined/empty", () => {
    expect(decodePricingHandoff(undefined)).toBeNull();
    expect(decodePricingHandoff(null)).toBeNull();
    expect(decodePricingHandoff("")).toBeNull();
  });
  it("returns null for garbage base64", () => {
    expect(decodePricingHandoff("not-valid-base64!!!")).toBeNull();
  });
  it("returns null for valid base64 that isn't JSON", () => {
    expect(decodePricingHandoff(btoa("hello world"))).toBeNull();
  });
  it("returns null for JSON missing required fields", () => {
    expect(decodePricingHandoff(btoa(encodeURIComponent(JSON.stringify({ family: "personal" }))))).toBeNull();
  });
  it("returns null for an unrecognized family", () => {
    expect(decodePricingHandoff(btoa(encodeURIComponent(JSON.stringify({ family: "not_a_family", pathway: "photography", summaryTitle: "x", summaryLines: [] }))))).toBeNull();
  });
  it("returns null for an unrecognized pathway", () => {
    expect(decodePricingHandoff(btoa(encodeURIComponent(JSON.stringify({ family: "personal", pathway: "not_a_pathway", summaryTitle: "x", summaryLines: [] }))))).toBeNull();
  });
  it("rejects an oversized payload rather than throwing", () => {
    const huge = "a".repeat(5000);
    expect(decodePricingHandoff(huge)).toBeNull();
  });
  it("encodePricingHandoff refuses to produce an oversized payload", () => {
    const encoded = encodePricingHandoff({
      family: "commercial",
      pathway: "photography",
      summaryTitle: "x".repeat(500), // longer than the 200-char cap, but still shouldn't blow the overall budget
      summaryLines: Array.from({ length: 50 }, (_, i) => `line ${i} `.repeat(20)),
    });
    // Either it's empty (refused) or, if produced, decodes safely and respects the per-field caps.
    if (encoded) {
      const decoded = decodePricingHandoff(encoded);
      expect(decoded?.summaryTitle.length).toBeLessThanOrEqual(200);
      expect(decoded?.summaryLines.length).toBeLessThanOrEqual(20);
    }
  });
});

describe("pricingHandoffFamilyLabel", () => {
  it("labels every family", () => {
    expect(pricingHandoffFamilyLabel("personal")).toBe("Personal Portrait");
    expect(pricingHandoffFamilyLabel("corporate")).toBe("Corporate & Headshots");
    expect(pricingHandoffFamilyLabel("wedding_event")).toBe("Weddings & Events");
    expect(pricingHandoffFamilyLabel("commercial")).toBe("Commercial / Advertising");
  });
});
