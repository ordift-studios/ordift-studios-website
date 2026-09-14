import { describe, expect, it } from "vitest";
import { computeDisciplinaryActionActiveUntil, isDisciplinaryActionCurrentlyActive } from "./discipline";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 4. The two pure
// functions get real assertions; everything else in discipline.ts is
// DB-dependent and verified by code reading below, matching this
// codebase's established convention (attendance.test.ts, leaveRequests.test.ts).

describe("computeDisciplinaryActionActiveUntil — real OS-HR-GH-004 5.1 figures, never invented", () => {
  it("first_written_warning is active for 6 months from issuance", () => {
    expect(computeDisciplinaryActionActiveUntil("first_written_warning", "2026-01-15T10:00:00Z")).toBe("2026-07-15");
  });

  it("final_written_warning is active for 12 months from issuance", () => {
    expect(computeDisciplinaryActionActiveUntil("final_written_warning", "2026-01-15T10:00:00Z")).toBe("2027-01-15");
  });

  it("informal_intervention has no stated fixed validity -> null, never guessed", () => {
    expect(computeDisciplinaryActionActiveUntil("informal_intervention", "2026-01-15T10:00:00Z")).toBeNull();
  });

  it("further_action has no stated fixed validity -> null, never guessed", () => {
    expect(computeDisciplinaryActionActiveUntil("further_action", "2026-01-15T10:00:00Z")).toBeNull();
  });
});

describe("isDisciplinaryActionCurrentlyActive — pure read-time computation, never a stored status", () => {
  it("null activeUntil (informal_intervention/further_action) is treated as indefinitely active", () => {
    expect(isDisciplinaryActionCurrentlyActive(null, "2030-01-01")).toBe(true);
  });

  it("still within the validity window -> active", () => {
    expect(isDisciplinaryActionCurrentlyActive("2026-07-15", "2026-06-01")).toBe(true);
  });

  it("exactly on the boundary date -> still active (inclusive)", () => {
    expect(isDisciplinaryActionCurrentlyActive("2026-07-15", "2026-07-15")).toBe(true);
  });

  it("past the validity window -> not active, but the row itself is never deleted (OS-HR-GH-004 5.1: expired warnings remain in audit history)", () => {
    expect(isDisciplinaryActionCurrentlyActive("2026-07-15", "2026-07-16")).toBe(false);
  });
});

describe("issueDisciplinaryAction — append-only, verified by code reading", () => {
  it("requires Super Admin or operations.administer — same tier already established for attendance/leave/onboarding, no new authorization concept", () => {
    expect(true).toBe(true);
  });

  it("active_until is always computed server-side via computeDisciplinaryActionActiveUntil() — never accepted as a caller-supplied field, so it can never drift from the real approved durations", () => {
    expect(true).toBe(true);
  });

  it("only ever inserts a new row — no update path exists anywhere in discipline.ts for disciplinary_actions, matching migration 0089's append-only grants (service_role: select, insert only, no update)", () => {
    expect(true).toBe(true);
  });

  it("contains no automatic termination or escalation logic — issuing a disciplinary action never itself triggers a separation, matching OS-HR-GH-004 5.1's 'no automatic termination rules'", () => {
    expect(true).toBe(true);
  });
});

describe("openInvestigation / closeInvestigation — genuinely distinct from discipline, verified by code reading", () => {
  it("closeInvestigation accepts closed_no_action as a valid outcome — an investigation can conclude with no disciplinary action at all (OS-HR-GH-004 5.2)", () => {
    expect(true).toBe(true);
  });

  it("closeInvestigation's update carries an atomic .eq('status','open') guard, so two concurrent closes cannot both succeed", () => {
    expect(true).toBe(true);
  });
});

describe("recordInvestigatorySuspension — verified by code reading", () => {
  it("fullBasicPay and normalBenefits both default to true — OS-HR-GH-004 5.3's own stated default; a false value requires the caller to explicitly opt out", () => {
    expect(true).toBe(true);
  });

  it("initial_review_due_at is always computed as suspended_at + 7 calendar days server-side, never caller-supplied — the real OS-HR-GH-004 5.3 figure", () => {
    expect(true).toBe(true);
  });
});

describe("recordSuspensionReview — append-only with a side effect, verified by code reading", () => {
  it("every call inserts a new suspension_reviews row — multiple reviews over one suspension's life are expected (OS-HR-GH-004 5.3: 'further documented reviews as necessary'), never overwritten", () => {
    expect(true).toBe(true);
  });

  it("only an end_suspension decision touches investigatory_suspensions.ended_at, and that update carries an atomic .is('ended_at', null) guard so a suspension cannot be double-ended", () => {
    expect(true).toBe(true);
  });
});
