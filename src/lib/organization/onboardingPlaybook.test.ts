import { describe, expect, it } from "vitest";
import { buildOnboardingPlaybook, ONBOARDING_CLASSIFICATIONS } from "./onboardingPlaybook";
import { EMPLOYEE_ONBOARDING_STAGES, EXTERNAL_CONTRACTOR_ONBOARDING_STAGES } from "./onboardingStages";

describe("buildOnboardingPlaybook — real assertions", () => {
  it("employee playbook has exactly the real EMPLOYEE_ONBOARDING_STAGES, in order, no invented stages", () => {
    const playbook = buildOnboardingPlaybook("employee");
    expect(playbook.steps.map((s) => s.stageKey)).toEqual([...EMPLOYEE_ONBOARDING_STAGES]);
  });

  it("every external classification playbook uses the real EXTERNAL_CONTRACTOR_ONBOARDING_STAGES sequence", () => {
    for (const classification of ["vendor_supplier", "contractor_freelancer", "instructor", "model_talent"] as const) {
      const playbook = buildOnboardingPlaybook(classification);
      expect(playbook.steps.map((s) => s.stageKey)).toEqual([...EXTERNAL_CONTRACTOR_ONBOARDING_STAGES]);
    }
  });

  it("vendor playbook's payment_setup stage lists the real vendor payment requirement, not a fabricated one", () => {
    const playbook = buildOnboardingPlaybook("vendor_supplier");
    const paymentStage = playbook.steps.find((s) => s.stageKey === "payment_setup")!;
    expect(paymentStage.internalActions.some((a) => a.includes("Vendor payment destination configured"))).toBe(true);
  });

  it("instructor playbook never includes vendor-only requirements (classification scoping, not just stage scoping)", () => {
    const playbook = buildOnboardingPlaybook("instructor");
    const allActions = playbook.steps.flatMap((s) => s.internalActions);
    expect(allActions.some((a) => a.includes("Vendor company profile"))).toBe(false);
    expect(allActions.some((a) => a.includes("Instructor / Workshop Facilitator Agreement"))).toBe(true);
  });

  it("engagement_assigned stage has zero requirements for every classification — the 2026-09-16 vendor lifecycle reconciliation applies universally, not just to vendor", () => {
    for (const classification of ["vendor_supplier", "contractor_freelancer", "instructor", "model_talent"] as const) {
      const playbook = buildOnboardingPlaybook(classification);
      const stage = playbook.steps.find((s) => s.stageKey === "engagement_assigned")!;
      expect(stage.internalActions).toEqual([]);
    }
  });

  it("external actions use an action verb derived from the real requirementType, never a generic placeholder for an agreement", () => {
    const playbook = buildOnboardingPlaybook("vendor_supplier");
    const profileStage = playbook.steps.find((s) => s.stageKey === "profile")!;
    expect(profileStage.externalActions.some((a) => a.startsWith("Sign:"))).toBe(true);
  });

  it("every classification listed in ONBOARDING_CLASSIFICATIONS produces a non-empty step list", () => {
    for (const c of ONBOARDING_CLASSIFICATIONS) {
      const playbook = buildOnboardingPlaybook(c.key);
      expect(playbook.steps.length).toBeGreaterThan(0);
    }
  });
});
