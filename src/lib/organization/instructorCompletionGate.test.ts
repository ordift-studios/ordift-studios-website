import { describe, expect, it } from "vitest";
import { computeUnsatisfiedRequired, INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG as CATALOG } from "./onboardingRequirements";

// What completeStaffOnboarding() evaluates: every REQUIRED item across the whole pipeline. For an instructor, nothing but genuine execution
// of OS-LGL-010 can satisfy the agreement item - not a waiver, not "not applicable", not a deferral, not a stored "satisfied" row.
const rows = (m: Record<string, string>) => new Map(Object.entries(m).map(([k, status]) => [k, { status: status as never }]));
const derived = (m: Record<string, "satisfied" | null>) => new Map(Object.entries(m));
const keys = (u: readonly { requirementKey: string }[]) => u.map((r) => r.requirementKey);

describe("final onboarding completion cannot bypass the instructor's executed agreement", () => {
  const payment = { instructor_payment_setup_completed: "satisfied" as const };
  it("with the agreement not executed, completion is blocked", () => {
    expect(keys(computeUnsatisfiedRequired(CATALOG, rows({}), derived({ ...payment })))).toEqual(["instructor_agreement_executed"]);
  });
  it.each(["waived", "not_applicable", "deferred", "satisfied"])("a stored “%s” row does not satisfy it", (status) => {
    expect(keys(computeUnsatisfiedRequired(CATALOG, rows({ instructor_agreement_executed: status }), derived({ ...payment })))).toEqual(["instructor_agreement_executed"]);
  });
  it("only genuine execution (the derived evidence) satisfies it", () => {
    expect(computeUnsatisfiedRequired(CATALOG, rows({}), derived({ ...payment, instructor_agreement_executed: "satisfied" }))).toEqual([]);
  });
  it("the optional identity item never blocks completion", () => {
    expect(keys(computeUnsatisfiedRequired(CATALOG, rows({}), derived({ ...payment, instructor_agreement_executed: "satisfied" })))).not.toContain("instructor_identity_verified");
  });
});
