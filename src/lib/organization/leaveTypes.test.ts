import { describe, expect, it } from "vitest";
import { resolveSickLeaveTierBreakdown, type SickLeaveTier } from "./leaveTypes";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 2.
// resolveSickLeaveTierBreakdown() is pure — real, executable assertions
// throughout. listLeaveTypes()/getLeaveTypeBySlug() are DB-dependent and
// verified by reading the seeded catalog directly against Production as
// part of this phase's own deployment verification.

const TIERS: SickLeaveTier[] = [
  { tier: 1, maxDays: 2, payPercent: 100, certificateRequired: false },
  { tier: 2, maxDays: 10, payPercent: 100, certificateRequired: true },
  { tier: 3, maxDays: 10, payPercent: 50, certificateRequired: true },
  { tier: 4, maxDays: 20, payPercent: 0, certificateRequired: true },
];

describe("resolveSickLeaveTierBreakdown — OS-HR-GH-002 5.1's real tiers, verbatim numbers only", () => {
  it("first 2 days of the year fall entirely in tier 1 (uncertified, 100% pay)", () => {
    const result = resolveSickLeaveTierBreakdown(TIERS, 0, 2);
    expect(result).toEqual([{ tier: 1, days: 2, payPercent: 100, certificateRequired: false }]);
  });

  it("a 5-day request starting from zero splits 2 (tier 1) + 3 (tier 2)", () => {
    const result = resolveSickLeaveTierBreakdown(TIERS, 0, 5);
    expect(result).toEqual([
      { tier: 1, days: 2, payPercent: 100, certificateRequired: false },
      { tier: 2, days: 3, payPercent: 100, certificateRequired: true },
    ]);
  });

  it("having already used 1 uncertified day, a 3-day request splits 1 (tier 1) + 2 (tier 2)", () => {
    const result = resolveSickLeaveTierBreakdown(TIERS, 1, 3);
    expect(result).toEqual([
      { tier: 1, days: 1, payPercent: 100, certificateRequired: false },
      { tier: 2, days: 2, payPercent: 100, certificateRequired: true },
    ]);
  });

  it("having already used all 12 days of tiers 1-2, the next 4 days fall entirely in tier 3 (50% pay)", () => {
    const result = resolveSickLeaveTierBreakdown(TIERS, 12, 4);
    expect(result).toEqual([{ tier: 3, days: 4, payPercent: 50, certificateRequired: true }]);
  });

  it("a request spanning tier 3 into tier 4 splits correctly across the 50%/0% boundary", () => {
    // tiers 1-3 = 22 days total; requesting 5 more days starting at day 20 -> 2 days left in tier 3, 3 days in tier 4
    const result = resolveSickLeaveTierBreakdown(TIERS, 20, 5);
    expect(result).toEqual([
      { tier: 3, days: 2, payPercent: 50, certificateRequired: true },
      { tier: 4, days: 3, payPercent: 0, certificateRequired: true },
    ]);
  });

  it("having exhausted all four tiers (42 days used), further days resolve to an empty breakdown — no fifth tier is invented", () => {
    const result = resolveSickLeaveTierBreakdown(TIERS, 42, 3);
    expect(result).toEqual([]);
  });

  it("total days across the breakdown always equals daysRequested when tiers have remaining capacity", () => {
    const result = resolveSickLeaveTierBreakdown(TIERS, 0, 7);
    const total = result.reduce((sum, entry) => sum + entry.days, 0);
    expect(total).toBe(7);
  });
});
