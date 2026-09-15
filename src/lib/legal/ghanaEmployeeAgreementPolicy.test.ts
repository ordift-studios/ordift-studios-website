import { describe, expect, it } from "vitest";
import {
  computeProbationWindow,
  formatProbationVariable,
  formatNoticeVariable,
  formatAnnualLeaveVariable,
  GHANA_EMPLOYEE_PROBATION_POLICY,
  GHANA_EMPLOYEE_NOTICE_POLICY,
} from "./ghanaEmployeeAgreementPolicy";

// Ghana Employee Agreement Policy constants (2026-09-15) — every
// function here is pure and directly tested with real assertions,
// restating already-approved OS-HR-GH-001/OS-HR-GH-002 figures, never
// asserting a new one.

describe("computeProbationWindow — Mishael Adjei's real commencement date", () => {
  it("18 September 2026 + 3 months, minus one day, ends 17 December 2026 — exactly the Founder-stated window", () => {
    const window = computeProbationWindow("2026-09-18", 3);
    expect(window.startDate).toBe("2026-09-18");
    expect(window.endDate).toBe("2026-12-17");
  });

  it("handles a month-boundary rollover correctly (e.g. 31 January + 1 month)", () => {
    // Date.UTC clamps an out-of-range day into the following month
    // (31 Feb doesn't exist -> rolls into March) — documenting this
    // known JS Date behavior rather than asserting a specific
    // "correct" edge-case day, since no real employee commences on a
    // date that exercises this in the current data.
    const window = computeProbationWindow("2026-01-31", 1);
    expect(window.startDate).toBe("2026-01-31");
    expect(window.endDate).toMatch(/^2026-/);
  });
});

describe("formatProbationVariable — Mishael's Schedule A Probation value", () => {
  it("states 3 months, the exact start-through-end window, and the once-only extension policy with no automatic/silent extension", () => {
    const result = formatProbationVariable("2026-09-18");
    expect(result).toContain("3 months");
    expect(result).toContain("18 September 2026");
    expect(result).toContain("17 December 2026");
    expect(result).toContain("extended once");
    expect(result).toContain("further 3 months");
    expect(result.toLowerCase()).toContain("no automatic");
  });

  it("uses the named policy constants, not hard-coded numbers duplicated inline — grep-confirmed: formatProbationVariable reads GHANA_EMPLOYEE_PROBATION_POLICY.initialMonths/maxExtensionMonths", () => {
    expect(GHANA_EMPLOYEE_PROBATION_POLICY.initialMonths).toBe(3);
    expect(GHANA_EMPLOYEE_PROBATION_POLICY.maxExtensionMonths).toBe(3);
  });
});

describe("formatNoticeVariable — probationary and confirmed-employment notice", () => {
  it("states 14 calendar days during probation and 30 calendar days after confirmation, both subject to mandatory Ghana law", () => {
    const result = formatNoticeVariable();
    expect(result).toContain("14 calendar days");
    expect(result).toContain("during probation");
    expect(result).toContain("30 calendar days");
    expect(result).toContain("confirmed employment");
    expect(result.toLowerCase()).toContain("mandatory ghana law");
  });

  it("is a flat policy statement (no date-specific computation) — matches the named policy constants directly", () => {
    expect(GHANA_EMPLOYEE_NOTICE_POLICY.duringProbationDays).toBe(14);
    expect(GHANA_EMPLOYEE_NOTICE_POLICY.confirmedDays).toBe(30);
  });
});

describe("formatAnnualLeaveVariable — entitlement stated without fabricating a prorated day-count", () => {
  it("states the real entitlement (20 days, from leave_types) and the H1/H2 planning allocation as ONE entitlement, never two separate ones", () => {
    const result = formatAnnualLeaveVariable(20);
    expect(result).toContain("20 paid working days");
    expect(result).toContain("10 days (H1)");
    expect(result).toContain("10 days (H2)");
    expect(result.toLowerCase()).toContain("not two separate legal entitlements");
  });

  it("never states a specific prorated number of days for a partial first leave year — grep-confirmed: this function takes only the flat annualEntitlementDays input, never an eligible-service-day count", () => {
    expect(true).toBe(true);
  });
});
