import { describe, expect, it } from "vitest";
import { groupEngagementsByLifecycle, type MyEngagement } from "@/lib/portal/engagementPortalData";

// Phase H.7 (2026-09-05) — H.6 found that a completed engagement simply
// vanished from the contractor's list (the page only ever rendered
// engagements NOT in {completed, cancelled}), reachable afterward only
// by a direct link no one necessarily has. This is the pure grouping
// logic behind the fix: completed work becomes a visible "Completed"
// section rather than disappearing, and cancelled engagements are kept
// in their own separate bucket rather than being folded into the same
// "history" as something that was actually delivered.

function engagement(status: string): MyEngagement {
  return {
    id: `eng-${status}`,
    engagementTypeName: null,
    operationalTitleName: "Graphic Designer",
    roleNote: null,
    notes: null,
    currency: "GHS",
    agreedAmount: 10,
    dueDate: null,
    status,
    paymentObligationId: null,
    createdAt: "2026-09-01T00:00:00Z",
  };
}

describe("groupEngagementsByLifecycle", () => {
  it("buckets each engagement into exactly one of active/completed/cancelled", () => {
    const all = [engagement("work_approved"), engagement("completed"), engagement("cancelled"), engagement("draft")];
    const { active, completed, cancelled } = groupEngagementsByLifecycle(all);
    expect(active.map((e) => e.status)).toEqual(["work_approved", "draft"]);
    expect(completed.map((e) => e.status)).toEqual(["completed"]);
    expect(cancelled.map((e) => e.status)).toEqual(["cancelled"]);
  });

  it("a completed engagement is never dropped — it lands in 'completed', not nowhere", () => {
    const { active, completed, cancelled } = groupEngagementsByLifecycle([engagement("completed")]);
    expect(active).toHaveLength(0);
    expect(cancelled).toHaveLength(0);
    expect(completed).toHaveLength(1);
  });

  it("completed and cancelled are never merged into the same bucket", () => {
    const { completed, cancelled } = groupEngagementsByLifecycle([engagement("completed"), engagement("cancelled")]);
    expect(completed.every((e) => e.status === "completed")).toBe(true);
    expect(cancelled.every((e) => e.status === "cancelled")).toBe(true);
  });

  it("an empty list produces three empty buckets", () => {
    const { active, completed, cancelled } = groupEngagementsByLifecycle([]);
    expect(active).toEqual([]);
    expect(completed).toEqual([]);
    expect(cancelled).toEqual([]);
  });
});
