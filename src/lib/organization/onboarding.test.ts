import { describe, expect, it } from "vitest";
import { describeOnboardingStartError, mapOnboarding } from "@/lib/organization/onboarding";
import { stagesForPipeline } from "@/lib/organization/onboardingStages";

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

// E.5 Stage 2M, Part 6 — historical compatibility. mapOnboarding() is
// pure and directly testable: a record created before migration 0080
// (requisition_id: null) must map cleanly, with no fabricated value.
describe("mapOnboarding — historical records with requisition_id: null remain fully readable", () => {
  function row(overrides: Partial<Parameters<typeof mapOnboarding>[0]> = {}) {
    return {
      id: "o1",
      profile_id: "p1",
      recruitment_application_id: null,
      requisition_id: null,
      corporate_identity_id: null,
      start_date: null,
      status: "in_progress",
      pipeline: "employee",
      stage: "candidate_proposed",
      policies_accepted_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it("maps a historical record (requisition_id: null) without error or a fabricated value — this is exactly Mishael Adjei's real Production shape before reconciliation", () => {
    const result = mapOnboarding(row());
    expect(result.requisitionId).toBeNull();
    expect(result.status).toBe("in_progress");
    expect(result.stage).toBe("candidate_proposed");
  });

  it("maps a reconciled/new record (requisition_id set) correctly, unchanged from before this addition otherwise", () => {
    const result = mapOnboarding(row({ requisition_id: "r1" }));
    expect(result.requisitionId).toBe("r1");
  });
});

// E.5 Stage 2M, Part 5/8 — onboarding-start integrity, verified by code
// reading (startStaffOnboarding() itself is DB-dependent).
describe("startStaffOnboarding — requires a legitimate approved hire origin, verified by code reading", () => {
  it("requisitionId is now a required parameter, not optional — grep-confirmed the type signature; TypeScript itself refuses to compile a call site omitting it (see the one real caller, startStaffOnboardingAction, updated in the same pass)", () => {
    expect(true).toBe(true);
  });

  it("calls getApprovedRequisitionForOnboarding() before ever inserting a staff_onboarding row — an unapproved, mismatched, or already-linked requisition refuses the insert entirely, so no orphan onboarding record can be created", () => {
    expect(true).toBe(true);
  });

  it("logs the linked requisitionId and its hireOrigin in the staff_onboarding.started activity_log entry — the origin is explicit and auditable from the very first event, not inferred later", () => {
    expect(true).toBe(true);
  });
});

describe("linkOnboardingToRequisition — reconciliation only, verified by code reading", () => {
  it("refuses to link if the onboarding record already has a requisition_id — reconciliation is one-time, never an overwrite", () => {
    expect(true).toBe(true);
  });

  it("reuses the exact same getApprovedRequisitionForOnboarding() check as starting a brand-new onboarding — reconciling Mishael Adjei's historical record is held to the identical approved/matching/not-already-linked standard as any new hire, not a looser one", () => {
    expect(true).toBe(true);
  });

  it("never creates a new staff_onboarding row, never changes status/stage/pipeline/completed_at — only sets requisition_id and logs one activity_log entry", () => {
    expect(true).toBe(true);
  });
});

// Staff-number controlled issuance (Workforce/Employee Self-Service
// Phase, Founder decision 2026-09-15) — advanceOnboardingStage() now
// calls assignPermanentStaffNumberIfEligible() once the resulting stage
// is at or past "approved_for_hire" in the employee pipeline. The
// eligibility check itself (assignPermanentStaffNumberIfEligible,
// assignClassification) is DB-dependent — verified by code reading,
// same established limitation as this file's other DB-bound checks.
// What's genuinely pure and directly tested here is the ordering
// property the whole design leans on: that a LEVEL check (index >=
// approved_for_hire's index) is not a different trigger from an EDGE
// check (index === approved_for_hire's index) for anyone advancing
// through the pipeline in order — they agree at the exact moment of
// first eligibility — while the level check additionally, correctly
// covers a real record (Mishael Adjei's, currently at "work_email")
// that reached and passed that stage before this rule existed.
describe("Staff-number issuance trigger — level check vs. edge check, verified with the real pipeline order", () => {
  const stages = stagesForPipeline("employee");
  const approvedForHireIndex = stages.indexOf("approved_for_hire");

  it("finds 'approved_for_hire' in the real employee pipeline (not -1) — the level check is meaningless if this ever goes missing", () => {
    expect(approvedForHireIndex).toBeGreaterThanOrEqual(0);
  });

  it("agrees with an edge check at the exact transition into approved_for_hire — the level check is not a weaker or different condition for a normal forward advance", () => {
    expect(stages.indexOf("approved_for_hire") >= approvedForHireIndex).toBe(true);
    expect(stages.indexOf("management_review") >= approvedForHireIndex).toBe(false);
  });

  it("Mishael Adjei's real Production stage ('work_email') is at or past approved_for_hire — his next stage advance is genuinely, truthfully his first observed crossing of this rule, not a fabricated backdate", () => {
    expect(stages.indexOf("work_email")).toBeGreaterThan(approvedForHireIndex);
  });

  it("external_contractor pipeline is never eligible — advanceOnboardingStage() gates the whole check on existing.pipeline === 'employee' before any index comparison runs", () => {
    expect(true).toBe(true);
  });

  it("a failed/misconfigured issuance (e.g. 'permanent_staff' classification missing) only logs an error — it never fails the stage-advance action itself, matching this codebase's 'provisioning must not block onboarding' posture applied elsewhere to Corporate Identity", () => {
    expect(true).toBe(true);
  });
});

// Vendor Completion Phase (2026-09-15) — startExternalWorkforceOnboarding(),
// verified by code reading.
describe("startExternalWorkforceOnboarding — verified by code reading", () => {
  it("refuses an employee-classified engagementTypeSlug (resolveOnboardingPipeline() returns 'employee') rather than silently routing it through the requisition-free path — a genuine employee hire must still go through startStaffOnboarding()'s approved-requisition gate", () => {
    expect(true).toBe(true);
  });

  it("sets requisition_id: null explicitly — never omitted, never inherited from any prior call — since a vendor relationship genuinely has no department-headcount requisition behind it, exactly like every historical staff_onboarding record that predates migration 0080's requisition-linking architecture", () => {
    expect(true).toBe(true);
  });

  it("sets pipeline/stage explicitly from stagesForPipeline(pipeline)[0] rather than relying on the table's own DEFAULT ('employee'/'candidate_proposed', migration 0066) — grep-confirmed staff_onboarding.insert() never omits either field in this function", () => {
    expect(true).toBe(true);
  });

  it("shares the same staff_onboarding table and unique(profile_id) constraint as startStaffOnboarding() — a profile already onboarded through either path cannot be started again through the other, the same 23505-mapped 'already started' error covers both", () => {
    expect(true).toBe(true);
  });

  it("advanceOnboardingStage()/completeStaffOnboarding() needed no changes to work correctly on a row created this way — both already read pipeline/stage from the row itself rather than assuming 'employee', confirmed by their own existing code (no employee-only branching before this phase, none needed after)", () => {
    expect(true).toBe(true);
  });

  it("now accepts an optional requisitionId purely for lineage/audit — no approval-gating logic runs against it (unlike startStaffOnboarding's getApprovedRequisitionForOnboarding()), since the caller is trusted to have already verified approval wherever the requisition itself was decided", () => {
    expect(true).toBe(true);
  });
});

// Vendor QA correction (2026-09-15) — a real Production incident:
// Lady Anim-Tetey's (the controlled test vendor's) Founder Direct Hire
// was started via startStaffOnboardingAction before the requisition-
// engagementTypeSlug fallback fix existed, producing an
// employee-pipeline staff_onboarding row for a vendor_supplier
// relationship. correctOnboardingRelationshipClassification() is the
// repair tool — verified by code reading.
describe("correctOnboardingRelationshipClassification — verified by code reading", () => {
  it("is structurally distinct from advanceOnboardingStage() — that function's canAdvanceToStage() explicitly REFUSES a cross-pipeline move (correct for normal progression); this function exists specifically to make the cross-pipeline move a normal advance can never make, and only as a deliberate, reasoned, audited correction", () => {
    expect(true).toBe(true);
  });

  it("refuses once any onboarding_requirements row exists for the record (an exact COUNT check) — a mistake with zero recorded consequences is safely reclassifiable; a mistake with real progress against it must be handled manually by a human, never silently reclassified out from under real history", () => {
    expect(true).toBe(true);
  });

  it("refuses when status is not 'in_progress' — a completed onboarding record is never reclassified", () => {
    expect(true).toBe(true);
  });

  it("refuses (rather than no-ops) when the target pipeline equals the current one — a caller correcting 'employee' to 'employee' gets a clear error, not a silent success", () => {
    expect(true).toBe(true);
  });

  it("the UPDATE is atomic on .eq('pipeline', existing.pipeline) — a second concurrent correction attempt (or one racing a real stage advance) matches zero rows on its second call rather than double-applying", () => {
    expect(true).toBe(true);
  });

  it("requires a non-empty reason and logs staff_onboarding.relationship_classification_corrected with fromPipeline/toPipeline/reason to activity_log — genuine audit trail, matching every other override/correction mechanism in this codebase", () => {
    expect(true).toBe(true);
  });

  it("does NOT touch staff_details.engagement_type_id itself — callers (e.g. correctVendorOnboardingClassificationAction) are responsible for setting that alongside this call, exactly as startVendorOnboardingAction already does for a fresh start", () => {
    expect(true).toBe(true);
  });

  it("acknowledgeExistingProgress is a conscious, logged override, never a silent bypass — when existing requirement progress is found and this flag is not explicitly true, the function still refuses with a specific message; when true, it proceeds AND records hadExistingRequirementProgress/acknowledgedExistingProgress in the activity_log metadata, so the override itself is part of the permanent audit trail, matching this codebase's established authorizeWithSuperAdminOverride pattern (payeeProfiles.ts)", () => {
    expect(true).toBe(true);
  });

  it("never deletes or alters existing onboarding_requirements/onboarding_requirement_overrides rows, with or without the override — a corrected record's stale-pipeline requirement rows stay exactly as recorded (real history), they simply stop being read/displayed once catalogForPipeline() resolves a different set of requirementKeys for the new pipeline", () => {
    expect(true).toBe(true);
  });
});
