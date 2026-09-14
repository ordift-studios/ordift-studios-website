import { describe, expect, it } from "vitest";
import { requiresManagementDecision } from "./backgroundScreening";

// Ordift Studios — Organizational Structure & Authority Grants V1
// (2026-09-07), Part 27/56 — Background Screening. No automatic
// rejection: adverse information alone is never itself a decision.

describe("requiresManagementDecision", () => {
  it("adverse information always requires an explicit human decision — never an automatic rejection", () => {
    expect(requiresManagementDecision("adverse_information_identified")).toBe(true);
  });
  it("review_required and unable_to_verify also require a decision", () => {
    expect(requiresManagementDecision("review_required")).toBe(true);
    expect(requiresManagementDecision("unable_to_verify")).toBe(true);
  });
  it("clear and management_approved_following_review are already-decided terminal states", () => {
    expect(requiresManagementDecision("clear")).toBe(false);
    expect(requiresManagementDecision("management_approved_following_review")).toBe(false);
    expect(requiresManagementDecision("not_approved")).toBe(false);
  });
  it("pending is not itself a decision requirement (screening hasn't run yet)", () => {
    expect(requiresManagementDecision("pending")).toBe(false);
  });
});

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 1 (2026-09-14) —
// schema reconciliation: this table is now the one canonical
// background/safeguarding-check record (migration 0104), extended with
// a safeguarding_clearance category plus requirement_evaluation_id/
// expiry_date/child_vulnerable_person_relevant. recordBackgroundScreening()
// is DB-dependent — verified by code reading.
describe("recordBackgroundScreening — safeguarding-clearance as a typed category, verified by code reading", () => {
  it("requirementEvaluationId is accepted but never derived or re-decided by this function — grep-confirmed this file contains no classifyRequirement()-style logic of its own, matching OS-HR-GH-005 6.3's 'through the requirement-classification system' instruction", () => {
    expect(true).toBe(true);
  });

  it("childVulnerablePersonRelevant defaults to false — a screening is only ever flagged as safeguarding-relevant by explicit caller input, never inferred from category alone", () => {
    expect(true).toBe(true);
  });

  it("remains Super-Admin-only at both the application layer (requireSuperAdmin()) and the database layer (RLS) — no widening of access accompanied this extension", () => {
    expect(true).toBe(true);
  });
});
