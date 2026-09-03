import { describe, expect, it } from "vitest";
import { getValidEngagementTransitions, isValidEngagementTransition, ENGAGEMENT_STATUSES } from "@/lib/payables/engagements";

// Engagement Lifecycle UI (2026-09-03) — this is the real authorization
// boundary for a status transition (setEngagementStatus() calls
// isValidEngagementTransition() before writing), not merely which
// buttons the UI happens to render. RLS/DB access aren't locally
// testable without a live Supabase session (same established
// limitation noted elsewhere in this codebase's test suite) — this
// pure state machine is the part that's both safety-critical and
// directly verifiable.

describe("engagement lifecycle transitions", () => {
  it("the required draft -> engagement_active -> work_submitted -> work_approved chain is valid, in order", () => {
    expect(isValidEngagementTransition("draft", "engagement_active")).toBe(true);
    expect(isValidEngagementTransition("engagement_active", "work_submitted")).toBe(true);
    expect(isValidEngagementTransition("work_submitted", "work_approved")).toBe(true);
  });

  it("rejects skipping a step — draft cannot jump straight to work_approved", () => {
    expect(isValidEngagementTransition("draft", "work_approved")).toBe(false);
  });

  it("rejects skipping straight to completed from draft", () => {
    expect(isValidEngagementTransition("draft", "completed")).toBe(false);
  });

  it("rejects moving backwards — work_approved cannot revert to draft", () => {
    expect(isValidEngagementTransition("work_approved", "draft")).toBe(false);
  });

  it("terminal states (completed, cancelled) have zero valid outgoing transitions", () => {
    expect(getValidEngagementTransitions("completed")).toEqual([]);
    expect(getValidEngagementTransitions("cancelled")).toEqual([]);
  });

  it("cancellation is reachable from every non-terminal state", () => {
    for (const status of ["draft", "engagement_active", "work_submitted", "on_hold"]) {
      expect(isValidEngagementTransition(status, "cancelled")).toBe(true);
    }
  });

  it("an unrecognized/garbage current status has zero valid transitions (fails closed)", () => {
    expect(getValidEngagementTransitions("not-a-real-status")).toEqual([]);
    expect(isValidEngagementTransition("not-a-real-status", "engagement_active")).toBe(false);
  });

  it("Approve Work and Cancel Engagement are both flagged as requiring confirmation", () => {
    const approveWork = getValidEngagementTransitions("work_submitted").find((t) => t.to === "work_approved");
    const cancel = getValidEngagementTransitions("draft").find((t) => t.to === "cancelled");
    expect(approveWork?.requiresConfirmation).toBe(true);
    expect(cancel?.requiresConfirmation).toBe(true);
  });

  it("every transition target is a real, declared engagement status", () => {
    for (const status of ENGAGEMENT_STATUSES) {
      for (const transition of getValidEngagementTransitions(status)) {
        expect(ENGAGEMENT_STATUSES).toContain(transition.to);
      }
    }
  });
});
