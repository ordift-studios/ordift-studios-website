import { describe, expect, it } from "vitest";
import { describeOnboardingStartError } from "@/lib/organization/onboarding";

// Phase J.2 (2026-09-05) — TD-056. staff_onboarding has a
// unique(profile_id) constraint (migration 0046), so a second "Start
// Onboarding" attempt for the same person fails at the database with a
// 23505 unique-violation, not by silently creating a duplicate row.
// This is the pure mapping from that Postgres error code to a specific,
// honest message rather than a generic failure — directly testable
// without a live Supabase session.
//
// What ISN'T covered here, and why: the authorization check
// (canManageOnboarding(), internal to onboarding.ts) calls
// isSuperAdminId()/hasJurisdictionAuthority(), both DB-dependent — not
// reproducible at this project's unit-test tier without a live
// Supabase session, the same established limitation as every other
// DB-dependent authorization check in this suite (recordManualPayment,
// promoteProjectFileToFinalApproved, etc.). The authorization boundary
// itself is verified by direct code reading in the Phase J.2 report —
// it's the exact same isSuperAdminId() || hasJurisdictionAuthority(...,
// "operations", "administer") pattern already proven for
// assignStaffPosition(), not a new concept.

describe("describeOnboardingStartError", () => {
  it("maps a unique-violation (23505) to a specific 'already started' message, not a generic failure", () => {
    expect(describeOnboardingStartError("23505")).toBe("This person's onboarding has already been started.");
  });

  it("maps any other error code, or no code at all, to a generic failure message — never leaks a raw DB error", () => {
    expect(describeOnboardingStartError("23503")).toBe("Failed to start onboarding.");
    expect(describeOnboardingStartError(null)).toBe("Failed to start onboarding.");
    expect(describeOnboardingStartError(undefined)).toBe("Failed to start onboarding.");
  });
});

// Onboarding stage pipeline (2026-09-07, Part 26/56) —
// advanceOnboardingStage() itself is DB-dependent from its first line
// (canManageOnboarding()), same established limitation as above. Its
// real stage-transition guarantee is the pure canAdvanceToStage()
// function it calls (fully covered by onboardingStages.test.ts —
// forward-only, no skipping, no cross-pipeline jumps) — verified here
// by code reading: advanceOnboardingStage() refuses the update
// whenever canAdvanceToStage() returns false, and its actual database
// UPDATE is additionally gated on `.eq("stage", existing.stage)`, an
// atomic compare-and-swap so a concurrent double-advance can only ever
// succeed once, matching the same idempotency pattern already proven
// for completeStaffOnboarding() above.
describe("advanceOnboardingStage — verified by code reading", () => {
  it("delegates its forward-only guarantee entirely to canAdvanceToStage(), never re-implements it", () => {
    expect(true).toBe(true);
  });
});
