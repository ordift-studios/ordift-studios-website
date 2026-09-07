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
