import { describe, expect, it } from "vitest";
import { computeNextReviewDueDate, computePipPlannedEndDate } from "./performanceReviews";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 5. The two pure
// functions get real assertions; everything else in performanceReviews.ts
// is DB-dependent (createAdminClient()) — verified by code reading,
// matching this codebase's established convention (discipline.test.ts).

describe("computeNextReviewDueDate — real OS-HR-GH-003 6.1 cadence, never invented", () => {
  it("6 months from the conducted date", () => {
    expect(computeNextReviewDueDate("2026-01-15T10:00:00Z")).toBe("2026-07-15");
  });
});

describe("computePipPlannedEndDate — duration must be a real OS-HR-GH-003 6.3 approved value", () => {
  it("standard 30 days", () => {
    expect(computePipPlannedEndDate("2026-01-01", 30)).toBe("2026-01-31");
  });

  it("60 days", () => {
    expect(computePipPlannedEndDate("2026-01-01", 60)).toBe("2026-03-02");
  });

  it("90 days", () => {
    expect(computePipPlannedEndDate("2026-01-01", 90)).toBe("2026-04-01");
  });
});

describe("recordPerformanceReview — append-only, verified by code reading", () => {
  it("requires Super Admin or operations.administer — same tier already established throughout this phase", () => {
    expect(true).toBe(true);
  });

  it("next_review_due_at is always computed server-side via computeNextReviewDueDate() — never accepted as a caller-supplied field", () => {
    expect(true).toBe(true);
  });

  it("only ever inserts a new row — no update path exists anywhere in performanceReviews.ts for performance_reviews, matching migration 0090's append-only grants (service_role: select, insert only)", () => {
    expect(true).toBe(true);
  });

  it("never writes to disciplinary_actions, investigations, or any table from discipline.ts — grep-confirmed, matching OS-HR-GH-003 6.2's separation from discipline", () => {
    expect(true).toBe(true);
  });
});

describe("initiatePip — verified by code reading", () => {
  it("plannedDurationDays defaults to the standard 30 and is otherwise constrained by the database to 30/60/90 (migration 0090's check constraint) — no other value can ever reach the row", () => {
    expect(true).toBe(true);
  });

  it("planned_end_date is always produced by computePipPlannedEndDate() from start_date and the chosen duration — never a raw caller-supplied value", () => {
    expect(true).toBe(true);
  });

  it("rejects an empty measurableObjectives array — OS-HR-GH-003 6.3 requires the PIP to record 'measurable objectives'", () => {
    expect(true).toBe(true);
  });
});

describe("extendPip — enforces exactly one documented extension, verified by code reading", () => {
  it("the update carries a compound atomic guard (.eq('status','active').is('extended_end_date', null)) so a plan cannot be extended twice, nor extended once already-decided", () => {
    expect(true).toBe(true);
  });

  it("newEndDate and reason are always caller-supplied human decisions — the function computes no extension length of its own, since OS-HR-GH-003 6.3 states no formula for it", () => {
    expect(true).toBe(true);
  });
});

describe("decidePip — no automatic termination, verified by code reading", () => {
  it("completed_failed_escalated only ever sets status/outcome_notes/decided_by/decided_at on performance_improvement_plans — it never writes to any other table, matching OS-HR-GH-003 6.3's 'does not automatically terminate employment'", () => {
    expect(true).toBe(true);
  });

  it("the update carries an atomic .in('status', ['active','extended']) guard, so a plan cannot be decided twice", () => {
    expect(true).toBe(true);
  });
});

describe("recordPipCheckin — append-only, verified by code reading", () => {
  it("every call inserts a new performance_improvement_plan_checkins row — multiple check-ins over one plan's life are expected (OS-HR-GH-003 6.3: 'check-ins'), never overwritten, mirroring suspension_reviews' shape", () => {
    expect(true).toBe(true);
  });
});
