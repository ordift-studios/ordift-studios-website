import { describe, expect, it } from "vitest";
import { isProjectFilePurgeEligible, deriveProjectFileDisplayState, isRetainTransition } from "@/lib/payables/projectFiles";

// Phase H.1/H.2 (2026-09-04) — the actual gate that decides whether a
// file may ever be deleted (Section 17 of the spec). This is the
// single most safety-critical piece of new logic in this phase — a
// bug here means either data loss (a file purged too early) or
// unbounded storage growth (never purging). Pure, no DB required.

const now = new Date("2026-09-15T00:00:00Z");

const baseEligible = {
  fileKind: "source_raw",
  lifecycleState: "backup_confirmed",
  retain: false,
  retainUntil: null,
  backupConfirmedAt: "2026-09-01T00:00:00Z", // 14 days before `now`
  engagementStatus: "completed",
  gracePeriodDays: 10,
  now,
};

describe("isProjectFilePurgeEligible", () => {
  it("is eligible when every condition is satisfied", () => {
    expect(isProjectFilePurgeEligible(baseEligible)).toBe(true);
  });

  it("final_approved is never eligible, regardless of any other flag — classification determines retention, not extension or lifecycle state", () => {
    expect(isProjectFilePurgeEligible({ ...baseEligible, fileKind: "final_approved" })).toBe(false);
    // Even if literally every other condition also says "delete me":
    expect(
      isProjectFilePurgeEligible({
        ...baseEligible,
        fileKind: "final_approved",
        lifecycleState: "backup_confirmed",
        retain: false,
        backupConfirmedAt: "2000-01-01T00:00:00Z",
      })
    ).toBe(false);
  });

  it("already-purged rows are never re-processed", () => {
    expect(isProjectFilePurgeEligible({ ...baseEligible, lifecycleState: "purged" })).toBe(false);
  });

  it("retain=true blocks purge unconditionally", () => {
    expect(isProjectFilePurgeEligible({ ...baseEligible, retain: true })).toBe(false);
  });

  it("a future retainUntil date blocks purge; a past one does not", () => {
    expect(isProjectFilePurgeEligible({ ...baseEligible, retainUntil: "2026-12-01T00:00:00Z" })).toBe(false);
    expect(isProjectFilePurgeEligible({ ...baseEligible, retainUntil: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("only a truly terminal engagement status qualifies — work_approved alone is not enough, since revisions could still follow", () => {
    expect(isProjectFilePurgeEligible({ ...baseEligible, engagementStatus: "work_approved" })).toBe(false);
    expect(isProjectFilePurgeEligible({ ...baseEligible, engagementStatus: "engagement_active" })).toBe(false);
    expect(isProjectFilePurgeEligible({ ...baseEligible, engagementStatus: "cancelled" })).toBe(true);
  });

  it("no backup confirmation at all means never eligible", () => {
    expect(isProjectFilePurgeEligible({ ...baseEligible, backupConfirmedAt: null })).toBe(false);
  });

  it("the grace period must have actually elapsed", () => {
    // backup confirmed only 3 days before `now`, grace period is 10 days
    expect(isProjectFilePurgeEligible({ ...baseEligible, backupConfirmedAt: "2026-09-12T00:00:00Z", gracePeriodDays: 10 })).toBe(false);
    // exactly at the boundary — 10 days later — should already qualify
    expect(isProjectFilePurgeEligible({ ...baseEligible, backupConfirmedAt: "2026-09-05T00:00:00Z", gracePeriodDays: 10 })).toBe(true);
  });
});

describe("deriveProjectFileDisplayState", () => {
  it("shows Active for a non-final file on a still-open engagement", () => {
    expect(deriveProjectFileDisplayState({ lifecycleState: "active", engagementStatus: "engagement_active", fileKind: "source_raw" })).toBe("Active");
  });

  it("shows Backup Required once the engagement is completed but the file hasn't been confirmed yet", () => {
    expect(deriveProjectFileDisplayState({ lifecycleState: "active", engagementStatus: "completed", fileKind: "source_raw" })).toBe("Backup Required");
  });

  it("shows Backup Confirmed once confirmed", () => {
    expect(deriveProjectFileDisplayState({ lifecycleState: "backup_confirmed", engagementStatus: "completed", fileKind: "source_raw" })).toBe("Backup Confirmed");
  });

  it("shows Cleanup Completed once purged, regardless of engagement status", () => {
    expect(deriveProjectFileDisplayState({ lifecycleState: "purged", engagementStatus: "completed", fileKind: "source_raw" })).toBe("Cleanup Completed");
  });

  it("a final_approved file always shows as retained, even before the engagement completes", () => {
    expect(deriveProjectFileDisplayState({ lifecycleState: "active", engagementStatus: "work_approved", fileKind: "final_approved" })).toBe("Retained (Final Deliverable)");
  });
});

// Phase H.4A (2026-09-05) — a real Production double-submission (no
// pending-disable guard on the Retain button) logged 4 identical
// retain:true activity events for one intended click. The persisted
// DATA was already correct either way (setProjectFileRetain "sets to
// X", it doesn't toggle), but the audit trail should record one event
// per actual state transition. This is the pure predicate the guard's
// SQL WHERE clause mirrors — see isRetainTransition()'s own comment.
describe("isRetainTransition", () => {
  it("false -> true is a real transition", () => {
    expect(isRetainTransition(false, true)).toBe(true);
  });

  it("true -> false is a real transition", () => {
    expect(isRetainTransition(true, false)).toBe(true);
  });

  it("true -> true (a repeat Retain request) is not a transition", () => {
    expect(isRetainTransition(true, true)).toBe(false);
  });

  it("false -> false (a repeat Remove Retain request) is not a transition", () => {
    expect(isRetainTransition(false, false)).toBe(false);
  });
});
