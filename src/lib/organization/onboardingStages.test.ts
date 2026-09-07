import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_ONBOARDING_STAGES,
  EXTERNAL_CONTRACTOR_ONBOARDING_STAGES,
  resolveOnboardingPipeline,
  isValidStage,
  isTerminalStage,
  nextStage,
  canAdvanceToStage,
} from "./onboardingStages";

// Organizational Structure & Authority Grants V1 closure (2026-09-07),
// Part 26/56 — onboarding stage pipeline.

describe("resolveOnboardingPipeline — never forces employee-only stages onto contractors/vendors", () => {
  it("full_time/part_time/fixed_term resolve to the employee pipeline", () => {
    expect(resolveOnboardingPipeline("full_time")).toBe("employee");
    expect(resolveOnboardingPipeline("part_time")).toBe("employee");
    expect(resolveOnboardingPipeline("fixed_term")).toBe("employee");
  });
  it("contractor/vendor/instructor/model/collaborator/intern/volunteer resolve to the shorter external track", () => {
    for (const slug of ["independent_contractor", "freelancer", "vendor_supplier", "instructor", "model_talent", "collaborator_partner", "intern", "volunteer", "project_based"]) {
      expect(resolveOnboardingPipeline(slug)).toBe("external_contractor");
    }
  });
});

describe("employee pipeline — the exact 10 named stages from the brief, in order", () => {
  it("matches the exact sequence: Candidate/Proposed -> ... -> Active", () => {
    expect(EMPLOYEE_ONBOARDING_STAGES).toEqual([
      "candidate_proposed",
      "preliminary_approval",
      "background_screening",
      "management_review",
      "approved_for_hire",
      "invited",
      "identity_profile",
      "work_email",
      "documents",
      "authority_assignment",
      "active",
    ]);
  });
});

describe("external contractor pipeline — the shorter track", () => {
  it("matches: Proposed -> Approved -> Invited -> Profile -> Payment Setup -> Engagement Assigned -> Active", () => {
    expect(EXTERNAL_CONTRACTOR_ONBOARDING_STAGES).toEqual([
      "proposed",
      "approved",
      "invited",
      "profile",
      "payment_setup",
      "engagement_assigned",
      "active",
    ]);
  });
  it("has no background_screening or management_review stage — never forced onto contractors", () => {
    expect(EXTERNAL_CONTRACTOR_ONBOARDING_STAGES).not.toContain("background_screening");
    expect(EXTERNAL_CONTRACTOR_ONBOARDING_STAGES).not.toContain("management_review");
  });
});

describe("nextStage — forward-only, never skips, never wraps", () => {
  it("advances one stage at a time", () => {
    expect(nextStage("employee", "candidate_proposed")).toBe("preliminary_approval");
    expect(nextStage("external_contractor", "proposed")).toBe("approved");
  });
  it("returns null at the terminal stage — never wraps back to the start", () => {
    expect(nextStage("employee", "active")).toBeNull();
    expect(nextStage("external_contractor", "active")).toBeNull();
  });
  it("returns null for an invalid/unknown stage", () => {
    expect(nextStage("employee", "not_a_real_stage")).toBeNull();
  });
});

describe("canAdvanceToStage — strictly one step forward, same pipeline only", () => {
  it("allows the immediate next stage", () => {
    expect(canAdvanceToStage("employee", "invited", "identity_profile")).toBe(true);
  });
  it("refuses skipping a stage", () => {
    expect(canAdvanceToStage("employee", "invited", "documents")).toBe(false);
  });
  it("refuses moving backward", () => {
    expect(canAdvanceToStage("employee", "documents", "invited")).toBe(false);
  });
  it("refuses a stage name from the OTHER pipeline", () => {
    expect(canAdvanceToStage("employee", "candidate_proposed", "proposed")).toBe(false);
  });
});

describe("isValidStage / isTerminalStage", () => {
  it("validates stage names against the correct pipeline only", () => {
    expect(isValidStage("employee", "background_screening")).toBe(true);
    expect(isValidStage("external_contractor", "background_screening")).toBe(false);
  });
  it("identifies the terminal stage of each pipeline", () => {
    expect(isTerminalStage("employee", "active")).toBe(true);
    expect(isTerminalStage("employee", "documents")).toBe(false);
    expect(isTerminalStage("external_contractor", "active")).toBe(true);
  });
});
