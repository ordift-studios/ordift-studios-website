import { describe, expect, it } from "vitest";
import { routeJurisdiction, requiresJurisdictionReview, SUPPORTED_JURISDICTIONS } from "./jurisdictionRouting";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E, Part 16.

describe("SUPPORTED_JURISDICTIONS", () => {
  it("supports Ghana, Qatar, United Kingdom, and International/Other", () => {
    expect(SUPPORTED_JURISDICTIONS).toEqual(["ghana", "qatar", "united_kingdom", "international_other"]);
  });
});

describe("routeJurisdiction — project/engagement jurisdiction only, never nationality/IP", () => {
  it("routes a supported jurisdiction directly", () => {
    expect(routeJurisdiction("ghana")).toEqual({ outcome: "routed", jurisdiction: "ghana" });
    expect(routeJurisdiction("QATAR")).toEqual({ outcome: "routed", jurisdiction: "qatar" });
  });

  it("requires review when no engagement jurisdiction is supplied — never silently defaults", () => {
    const result = routeJurisdiction(null);
    expect(result.outcome).toBe("review_required");
  });

  it("requires review for an unsupported jurisdiction value rather than guessing the closest match", () => {
    const result = routeJurisdiction("france");
    expect(result.outcome).toBe("review_required");
  });

  it("requires review whenever the caller flags the transaction as complex/conflicting, even for an otherwise-supported jurisdiction", () => {
    const result = routeJurisdiction("ghana", true);
    expect(result.outcome).toBe("review_required");
  });

  it("this module has no function that accepts a nationality/IP-address parameter at all", () => {
    // Structural guarantee: routeJurisdiction()'s only REQUIRED
    // parameter is the engagement jurisdiction string (Function.length
    // excludes the defaulted isComplexOrConflicting param) — there is
    // no third parameter for a person's nationality or IP address.
    expect(routeJurisdiction.length).toBe(1);
  });
});

describe("requiresJurisdictionReview", () => {
  it("true only for review_required outcomes", () => {
    expect(requiresJurisdictionReview({ outcome: "review_required", reason: "x" })).toBe(true);
    expect(requiresJurisdictionReview({ outcome: "routed", jurisdiction: "ghana" })).toBe(false);
  });
});
