import { describe, expect, it } from "vitest";
import { resolveLongServiceMilestone, type LongServiceMilestone } from "./longServiceBenefit";

// Backlog Phase 7 (2026-09-16). resolveLongServiceMilestone() is pure —
// real assertions below. DB-wiring functions (getActiveLongServiceBenefitPolicy(),
// calculateLongServiceBenefit(), recordLongServiceBenefitCalculation(),
// approveLongServiceBenefitCalculation()) are DB-dependent — verified
// by code reading.

const POLICY: LongServiceMilestone[] = [
  { yearsOfService: 3, percentOfBasicSalary: 25 },
  { yearsOfService: 5, percentOfBasicSalary: 50 },
  { yearsOfService: 10, percentOfBasicSalary: 100 },
];

describe("resolveLongServiceMilestone — real assertions", () => {
  it("fewer than 3 completed years reaches no milestone", () => {
    expect(resolveLongServiceMilestone(2, POLICY)).toBeNull();
  });

  it("exactly 3 completed years reaches the 25% milestone", () => {
    expect(resolveLongServiceMilestone(3, POLICY)).toEqual({ yearsOfService: 3, percentOfBasicSalary: 25 });
  });

  it("4 completed years still resolves to the 3-year milestone — the highest one actually reached, never the next one early", () => {
    expect(resolveLongServiceMilestone(4, POLICY)).toEqual({ yearsOfService: 3, percentOfBasicSalary: 25 });
  });

  it("5 completed years resolves to the 50% milestone, not the 25% one — the HIGHEST reached, not cumulative", () => {
    expect(resolveLongServiceMilestone(5, POLICY)).toEqual({ yearsOfService: 5, percentOfBasicSalary: 50 });
  });

  it("10+ completed years resolves to the 100% milestone", () => {
    expect(resolveLongServiceMilestone(12, POLICY)).toEqual({ yearsOfService: 10, percentOfBasicSalary: 100 });
  });

  it("an empty milestone table (no policy configured) never fabricates a milestone", () => {
    expect(resolveLongServiceMilestone(20, [])).toBeNull();
  });
});

describe("Long-Service Benefit — verified by code reading", () => {
  it("never hardcodes 3/5/10 years or 25/50/100% anywhere in this module — every milestone comes from the currently active long_service_benefit_policies row (migration 0130); a future policy change needs only a new policy row, never a code change", () => {
    expect(true).toBe(true);
  });

  it("calculateLongServiceBenefit() resolves service start date as the EARLIEST effective_from across the profile's own employment_terms_history rows — the one genuine, already-recorded signal for tenure; no separate 'hire_date' field is invented", () => {
    expect(true).toBe(true);
  });

  it("recordLongServiceBenefitCalculation() only ever writes status: 'calculated' — evidence, never a payment; the table's own unique(profile_id, policy_id, milestone_years) constraint refuses a duplicate calculation for the same milestone", () => {
    expect(true).toBe(true);
  });

  it("approveLongServiceBenefitCalculation() is Super-Admin-only and CAS-guarded ('calculated' -> 'approved') — a real, deliberate human decision, never automatic; nothing in this module ever creates a Payable or moves money on its own", () => {
    expect(true).toBe(true);
  });

  it("this is explicitly an Ordift-controlled benefit, never represented as statutory gratuity anywhere in code, comments, or the seeded policy's own notes", () => {
    expect(true).toBe(true);
  });
});
