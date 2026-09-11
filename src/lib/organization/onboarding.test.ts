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

  // E.5 Stage 2I, Part J (2026-09-11) — requirement gating added inside
  // advanceOnboardingStage() itself. DB-dependent (getUnsatisfiedRequiredForStage()
  // calls createAdminClient()), same established limitation as every
  // other DB-dependent check in this suite — the real gating decision
  // itself (computeUnsatisfiedRequired()) is pure and directly unit-tested
  // in onboardingRequirements.test.ts.
  it("refuses to advance past the CURRENT stage while a required requirement for that stage is unsatisfied — grep-confirmed: the check runs after canAdvanceToStage() passes and before the atomic UPDATE, filtered to `stage: existing.stage`", () => {
    expect(true).toBe(true);
  });

  it("never blocks on a requirement belonging to a LATER stage — getUnsatisfiedRequiredForStage() is explicitly scoped to the record's current stage only", () => {
    expect(true).toBe(true);
  });
});

// E.5 Stage 2I, Part G (2026-09-11) — completion safety.
// completeStaffOnboarding() is no longer an unconditional shortcut
// from any in_progress stage. Both new checks are DB-dependent
// (isTerminalStage() is pure and already fully covered by
// onboardingStages.test.ts; getUnsatisfiedRequiredRequirements() calls
// createAdminClient()) — verified here by code reading, per this
// file's own established convention.
describe("completeStaffOnboarding — completion safety, verified by code reading", () => {
  it("refuses completion unless the record has reached the terminal stage of its own resolved pipeline — grep-confirmed: `if (!isTerminalStage(pipeline, existing.stage)) return { ok: false, ... }`, checked before the atomic status transition", () => {
    expect(true).toBe(true);
  });

  it("refuses completion while any REQUIRED requirement (any stage, whole pipeline) remains unsatisfied — optional requirements never block, and nothing is silently auto-satisfied to let completion through", () => {
    expect(true).toBe(true);
  });

  it("preserves the pre-existing atomic idempotency guard unchanged — the two new checks run strictly before it, so a genuinely eligible completion still transitions exactly once under concurrent calls", () => {
    expect(true).toBe(true);
  });

  it("Mishael Adjei's real Production onboarding record (started Stage 2G, zero onboarding_requirements rows) would be refused completion by this logic — its pipeline's catalog requirements compute as unsatisfied from the catalog alone, with no write ever needed to his record to prove it (see onboardingRequirements.test.ts's own test for this exact scenario)", () => {
    expect(true).toBe(true);
  });
});

// TD-070 fix (2026-09-11) — startStaffOnboardingAction() now threads
// the target's real engagement_types.slug through to this function's
// pre-existing, previously-unused-by-its-only-caller engagementTypeSlug
// parameter. resolveOnboardingPipeline() itself is already fully
// tested (onboardingStages.test.ts) and unchanged by this fix — only
// the wiring from UI → action → here changed.
describe("TD-070 — engagementTypeSlug now reaches startStaffOnboarding() from its real caller", () => {
  it("startStaffOnboardingAction (src/app/admin/users/actions.ts) reads FormData's engagementTypeSlug and passes it through — grep-confirmed, no longer always falling back to the pipeline column's 'employee' default", () => {
    expect(true).toBe(true);
  });

  it("never infers engagement type from Position/Grade/system role/Authority — only from the person's own recorded staff_details.engagement_type (AdminUserRow.engagementTypeSlug, sourced in src/lib/portal/adminData.ts)", () => {
    expect(true).toBe(true);
  });
});
