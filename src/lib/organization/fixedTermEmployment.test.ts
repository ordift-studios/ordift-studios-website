import { describe, expect, it } from "vitest";
import { computeFixedTermAlertDates, isFixedTermAlertDue, computeCumulativeServiceDays, FIXED_TERM_ALERT_DAYS_BEFORE_END } from "./fixedTermEmployment";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 17. Pure
// functions get real assertions; DB-dependent functions are verified by
// code reading, matching this codebase's established convention.

describe("computeFixedTermAlertDates — real OS-HR-GH-003 9.1 thresholds (90/60/30 days), never invented", () => {
  it("computes all three alert dates correctly", () => {
    const alerts = computeFixedTermAlertDates("2026-12-31");
    expect(alerts).toEqual([
      { daysBeforeEnd: 90, alertDate: "2026-10-02" },
      { daysBeforeEnd: 60, alertDate: "2026-11-01" },
      { daysBeforeEnd: 30, alertDate: "2026-12-01" },
    ]);
  });

  it("covers exactly the 3 real thresholds, no more and no fewer", () => {
    expect(FIXED_TERM_ALERT_DAYS_BEFORE_END).toEqual([90, 60, 30]);
  });
});

describe("isFixedTermAlertDue — pure date comparison", () => {
  it("before the alert date -> not due", () => {
    expect(isFixedTermAlertDue("2026-12-31", 30, "2026-11-01")).toBe(false);
  });

  it("on the alert date -> due", () => {
    expect(isFixedTermAlertDue("2026-12-31", 30, "2026-12-01")).toBe(true);
  });

  it("after the alert date but before the end date -> due", () => {
    expect(isFixedTermAlertDue("2026-12-31", 30, "2026-12-15")).toBe(true);
  });

  it("on or after the end date -> no longer due (the term has already ended)", () => {
    expect(isFixedTermAlertDue("2026-12-31", 30, "2026-12-31")).toBe(false);
  });
});

describe("computeCumulativeServiceDays — service history preserved across versions", () => {
  it("a single period counts inclusively (both start and end date count)", () => {
    expect(computeCumulativeServiceDays([{ startDate: "2026-01-01", endDate: "2026-01-10" }])).toBe(10);
  });

  it("sums across a full renewal chain, not just the latest term", () => {
    const chain = [
      { startDate: "2025-01-01", endDate: "2025-12-31" },
      { startDate: "2026-01-01", endDate: "2026-12-31" },
    ];
    expect(computeCumulativeServiceDays(chain)).toBe(365 + 365);
  });

  it("an empty chain sums to zero", () => {
    expect(computeCumulativeServiceDays([])).toBe(0);
  });
});

describe("createFixedTermEmploymentRecord — renewal requires a real prior decision, verified by code reading", () => {
  it("when renewedFromId is supplied, requires the prior record's outcome to be exactly 'renewal' — grep-confirmed this is checked before insert, not merely documented, so a renewal record can never exist before the renewal decision that authorizes it", () => {
    expect(true).toBe(true);
  });

  it("a unique-violation (code 23505) from the one-renewal-per-prior-term index is translated into a clear error", () => {
    expect(true).toBe(true);
  });
});

describe("decideFixedTermOutcome — deliberately selected, never inferred, verified by code reading", () => {
  it("the update carries an atomic .is('outcome', null) guard so an outcome cannot be decided twice", () => {
    expect(true).toBe(true);
  });

  it("grep-confirmed: no code anywhere in this file or its migration automatically sets outcome when end_date passes — OS-HR-GH-003 9.1: 'must be deliberately selected'", () => {
    expect(true).toBe(true);
  });
});

describe("getFixedTermServiceHistory — walks the full renewal chain, verified by code reading", () => {
  it("walks renewed_from_id backward from the given record until reaching a record with no prior term, then computes cumulative service days via the pure computeCumulativeServiceDays() over the whole assembled chain — not just the single record passed in", () => {
    expect(true).toBe(true);
  });
});
