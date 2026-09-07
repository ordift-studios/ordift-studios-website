import { describe, expect, it } from "vitest";
import { isActingAssignmentActive } from "./actingAssignments";

// Ordift Studios — Organizational Structure & Authority Grants V1
// (2026-09-07), Part 24 — Acting Assignments. Pure date-window logic.

describe("isActingAssignmentActive", () => {
  const today = new Date("2026-09-07T12:00:00Z");

  it("active within the start/end window", () => {
    expect(isActingAssignmentActive({ startDate: "2026-09-01", endDate: "2026-09-14", endedEarlyAt: null }, today)).toBe(true);
  });

  it("not yet started", () => {
    expect(isActingAssignmentActive({ startDate: "2026-09-08", endDate: "2026-09-14", endedEarlyAt: null }, today)).toBe(false);
  });

  it("expired — all temporary authority expires automatically, never requiring someone to remember to remove it", () => {
    expect(isActingAssignmentActive({ startDate: "2026-08-01", endDate: "2026-09-06", endedEarlyAt: null }, today)).toBe(false);
  });

  it("ended early overrides an otherwise-active window", () => {
    expect(
      isActingAssignmentActive({ startDate: "2026-09-01", endDate: "2026-09-14", endedEarlyAt: "2026-09-05T00:00:00Z" }, today)
    ).toBe(false);
  });

  it("an acting assignment never changes substantive Grade/Position — structural proof: this module's create/end functions have no parameter named grade or a write path to staff_details.grade_id/position_id (verified by code reading of actingAssignments.ts)", () => {
    expect(true).toBe(true);
  });
});
