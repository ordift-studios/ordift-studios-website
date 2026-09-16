import { describe, expect, it } from "vitest";
import { computeServiceLengthBreakdown, formatServiceLength } from "./serviceLength";

describe("computeServiceLengthBreakdown / formatServiceLength — real assertions", () => {
  it("same day → 0 days", () => {
    const b = computeServiceLengthBreakdown("2026-09-16", "2026-09-16");
    expect(b).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
    expect(formatServiceLength(b)).toBe("0 days");
  });

  it("14 days in → days only, never weeks", () => {
    const b = computeServiceLengthBreakdown("2026-09-01", "2026-09-15");
    expect(b.years).toBe(0);
    expect(b.months).toBe(0);
    expect(b.totalDays).toBe(14);
    expect(formatServiceLength(b)).toBe("14 days");
  });

  it("exactly 1 month later", () => {
    const b = computeServiceLengthBreakdown("2026-08-16", "2026-09-16");
    expect(b).toEqual({ years: 0, months: 1, days: 0, totalDays: 31 });
    expect(formatServiceLength(b)).toBe("1 month, 0 days");
  });

  it("months + days, singular/plural wording", () => {
    const b = computeServiceLengthBreakdown("2026-07-01", "2026-09-16");
    expect(b.years).toBe(0);
    expect(b.months).toBe(2);
    expect(b.days).toBe(15);
    expect(formatServiceLength(b)).toBe("2 months, 15 days");
  });

  it("exactly 1 year later", () => {
    const b = computeServiceLengthBreakdown("2025-09-16", "2026-09-16");
    expect(b).toEqual({ years: 1, months: 0, days: 0, totalDays: 365 });
    expect(formatServiceLength(b)).toBe("1 year, 0 months, 0 days");
  });

  it("years + months + days, borrowing across a short month (Feb)", () => {
    // Start Jan 31 -> as-of Mar 2: Feb has 28 days in 2026 (not a leap
    // year), so borrowing must use the days-in-February count, not a
    // fixed 30/31.
    const b = computeServiceLengthBreakdown("2024-01-31", "2026-03-02");
    expect(b.years).toBe(2);
    expect(b.months).toBe(1);
    expect(b.days).toBe(2);
  });

  it("future/invalid range (asOf before start) never goes negative", () => {
    const b = computeServiceLengthBreakdown("2026-09-16", "2026-01-01");
    expect(b).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
  });

  it("multi-year tenure with non-zero months/days", () => {
    const b = computeServiceLengthBreakdown("2021-03-10", "2026-09-16");
    expect(b.years).toBe(5);
    expect(b.months).toBe(6);
    expect(b.days).toBe(6);
    expect(formatServiceLength(b)).toBe("5 years, 6 months, 6 days");
  });
});
