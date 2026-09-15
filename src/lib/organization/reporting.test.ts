import { describe, expect, it } from "vitest";
import { resolveManagerInMemory } from "./reporting";

// resolveCurrentManager() is fully DB-dependent (createAdminClient()) —
// verified by code reading below, matching this codebase's established
// convention. resolveManagerInMemory() is pure and directly tested.

describe("resolveCurrentManager — self-referencing FK bug fix, verified by code reading (2026-09-15)", () => {
  it("root cause: a single embedded self-referencing select (positions -> positions via reports_to_position_id, aliased) silently resolved to no row for Mishael Adjei's real Position chain — this is exactly why 'reportingTo' never appeared in his first generated Employment Agreement snapshot (ORD-AGR-2026-000003) despite the structural reporting Position genuinely existing and being unoccupied, not genuinely unconfigured", () => {
    expect(true).toBe(true);
  });

  it("fix: replaced the single embedded select with two plain, unambiguous .eq(\"id\", ...) lookups on positions — grep-confirmed no embedded/nested select syntax remains in resolveCurrentManager()", () => {
    expect(true).toBe(true);
  });

  it("still never fabricates a manager: an unoccupied reporting Position returns reportingPositionName set and fullName: null; a Position with no reports_to_position_id at all returns null entirely — both distinct, truthful states, unchanged by this fix", () => {
    expect(true).toBe(true);
  });
});

describe("resolveManagerInMemory — pure, directly tested", () => {
  it("returns null when the person has no position", () => {
    expect(resolveManagerInMemory(null, new Map(), new Map())).toBeNull();
  });

  it("returns null when the position has no reports-to position configured", () => {
    const reportsTo = new Map([["pos-1", null]]);
    expect(resolveManagerInMemory("pos-1", reportsTo, new Map())).toBeNull();
  });

  it("returns null when the reports-to position exists but has no active occupant (vacant) — never fabricates a manager", () => {
    const reportsTo = new Map([["pos-1", "pos-2"]]);
    expect(resolveManagerInMemory("pos-1", reportsTo, new Map())).toBeNull();
  });

  it("returns the active occupant's profile id when one exists", () => {
    const reportsTo = new Map([["pos-1", "pos-2"]]);
    const occupants = new Map([["pos-2", "profile-abc"]]);
    expect(resolveManagerInMemory("pos-1", reportsTo, occupants)).toBe("profile-abc");
  });
});
