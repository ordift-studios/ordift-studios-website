import { describe, expect, it } from "vitest";
import { convertedAmountsMatch } from "@/lib/payments/currency";

// TD-036 — the comparison this function performs is the entire
// server-authoritative compare-and-reconfirm guarantee: a false match
// would let a genuinely stale quote through silently; a false mismatch
// would show every customer a spurious "rate changed" reconciliation
// screen on every checkout. Both failure directions are covered below.

describe("convertedAmountsMatch", () => {
  it("matches when both amounts are identical", () => {
    expect(convertedAmountsMatch(1108.98, 1108.98)).toBe(true);
  });

  it("matches when the difference is smaller than one cent (floating-point representation noise)", () => {
    expect(convertedAmountsMatch(1108.98, 1108.9800000001)).toBe(true);
    expect(convertedAmountsMatch(1108.98, 1108.9799999999)).toBe(true);
  });

  it("does not match a genuine one-cent difference", () => {
    expect(convertedAmountsMatch(1108.98, 1108.99)).toBe(false);
  });

  it("does not match a larger, genuine rate change", () => {
    expect(convertedAmountsMatch(1108.98, 1110.0)).toBe(false);
  });

  it("matches zero to zero", () => {
    expect(convertedAmountsMatch(0, 0)).toBe(true);
  });
});
