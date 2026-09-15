import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { resolveOnboardingPipeline, canAdvanceToStage, isTerminalStage, stagesForPipeline, type OnboardingPipeline, type OnboardingStage } from "@/lib/organization/onboardingStages";
import { getUnsatisfiedRequiredRequirements, getUnsatisfiedRequiredForStage } from "@/lib/organization/onboardingRequirements";
import { getApprovedRequisitionForOnboarding } from "@/lib/recruitment/requisitions";
import { assignPermanentStaffNumberIfEligible } from "@/lib/portal/memberNumbers";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part F (2026-08-25) — staff onboarding PROCESS tracker, against
// public.staff_onboarding. Deliberately thin: Position/Grade/
// Department/reporting resolution already happens via
// assignStaffPosition() (src/lib/organization/assignPosition.ts), and
// the staff/member number is issued through the existing, untouched
// Phase 2.1 sequential numbering architecture
// (src/lib/portal/memberNumbers.ts) — this module never duplicates
// either. It only tracks which onboarding steps are done for a real,
// already-existing profile.

export type StaffOnboarding = {
  id: string;
  profileId: string;
  recruitmentApplicationId: string | null;
  // The approved hire definition this onboarding originated from (E.5
  // Stage 2M) — null for historical records created before this
  // column existed (migration 0080), genuinely unknown, never
  // backfilled with an invented value. Required for every NEW
  // onboarding going forward — see startStaffOnboarding().
  requisitionId: string | null;
  corporateIdentityId: string | null;
  startDate: string | null;
  status: string;
  pipeline: OnboardingPipeline;
  stage: string;
  policiesAcceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

// Exported for direct unit testing (E.5 Stage 2M, Part 6 — historical
// records with requisition_id: null must remain fully readable).
export function mapOnboarding(r: {
  id: string;
  profile_id: string;
  recruitment_application_id: string | null;
  requisition_id: string | null;
  corporate_identity_id: string | null;
  start_date: string | null;
  status: string;
  pipeline: string;
  stage: string;
  policies_accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
}): StaffOnboarding {
  return {
    id: r.id,
    profileId: r.profile_id,
    recruitmentApplicationId: r.recruitment_application_id,
    requisitionId: r.requisition_id,
    corporateIdentityId: r.corporate_identity_id,
    startDate: r.start_date,
    status: r.status,
    pipeline: r.pipeline as OnboardingPipeline,
    stage: r.stage,
    policiesAcceptedAt: r.policies_accepted_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}

const SELECT = "id, profile_id, recruitment_application_id, requisition_id, corporate_identity_id, start_date, status, pipeline, stage, policies_accepted_at, completed_at, created_at";

// Phase J.2 (2026-09-05) — startStaffOnboarding()/completeStaffOnboarding()
// had NO authorization check of their own before this phase (a real
// gap found while verifying this module ahead of wiring it into the
// Admin Portal — J.1 only confirmed the backend existed, not that it
// was safe to expose). Matches assignStaffPosition()'s exact boundary
// exactly, for consistency: Super Admin unrestricted, or a holder of
// the operations.administer capability (PRIME's package) — the same
// tier already trusted with routine organizational assignment. No new
// authorization concept introduced.
export async function canManageOnboarding(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// Pure — maps a Postgres error code to a specific, honest message.
// staff_onboarding has a unique(profile_id) constraint (migration 0046),
// so a second "start" attempt for the same person fails with 23505, not
// silently creating a duplicate row — this turns that into a clear
// "already started" message instead of a generic failure. Exported for
// direct unit testing.
export function describeOnboardingStartError(code: string | null | undefined): string {
  if (code === "23505") return "This person's onboarding has already been started.";
  return "Failed to start onboarding.";
}

export async function listStaffOnboarding(): Promise<StaffOnboarding[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_onboarding").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load staff_onboarding", error.message);
    return [];
  }
  return (data ?? []).map(mapOnboarding);
}

export async function getStaffOnboardingById(onboardingId: string): Promise<StaffOnboarding | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_onboarding").select(SELECT).eq("id", onboardingId).maybeSingle();
  if (error || !data) return null;
  return mapOnboarding(data);
}

// staff_onboarding has a unique(profile_id) constraint (migration
// 0046), so this can never return more than one row — used by the
// Employee Profile page's Agreement Readiness section to resolve a
// person's onboarding record without the caller needing to already
// know its id.
export async function getStaffOnboardingByProfileId(profileId: string): Promise<StaffOnboarding | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_onboarding").select(SELECT).eq("profile_id", profileId).maybeSingle();
  if (error || !data) return null;
  return mapOnboarding(data);
}

export async function startStaffOnboarding(params: {
  profileId: string;
  // E.5 Stage 2M, Part 5 — required, not optional. "An ordinary
  // administrator must not be able to create an orphan employee
  // onboarding record with no approved hire definition." This is the
  // real enforcement point: getApprovedRequisitionForOnboarding()
  // confirms the requisition exists, is approved, isn't already
  // linked elsewhere, and — for a Founder Direct Hire — genuinely
  // names this profile.
  requisitionId: string;
  recruitmentApplicationId?: string | null;
  startDate?: string | null;
  // Onboarding stage pipeline (2026-09-07, Part 26/56) — resolved from
  // the person's actual engagement classification, per explicit
  // instruction never to force employee-only stages onto a contractor/
  // vendor. Optional: a caller-supplied value always wins; when
  // omitted, this now falls back to the REQUISITION's own
  // engagement_type_id (below) rather than silently defaulting to the
  // DB column's 'employee' default — root-cause fix (2026-09-15) for a
  // real Production incident where a vendor_supplier Founder Direct
  // Hire was started before the target had a staff_details row of
  // their own (the UI's only prior source for this value), silently
  // producing an employee-pipeline onboarding for a vendor. The
  // requisition is the authoritative statement of what this specific
  // hire genuinely is — it was just approved as exactly that.
  engagementTypeSlug?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; onboardingId: string } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to onboard staff." };
  }

  const requisitionCheck = await getApprovedRequisitionForOnboarding(params.requisitionId, params.profileId);
  if (!requisitionCheck.ok) {
    return { ok: false, error: requisitionCheck.error };
  }

  const admin = createAdminClient();

  let engagementTypeSlug = params.engagementTypeSlug ?? null;
  if (!engagementTypeSlug && requisitionCheck.requisition.engagementTypeId) {
    const { data: engagementType } = await admin
      .from("engagement_types")
      .select("slug")
      .eq("id", requisitionCheck.requisition.engagementTypeId)
      .maybeSingle();
    engagementTypeSlug = engagementType?.slug ?? null;
  }

  const { data, error } = await admin
    .from("staff_onboarding")
    .insert({
      profile_id: params.profileId,
      requisition_id: params.requisitionId,
      recruitment_application_id: params.recruitmentApplicationId ?? null,
      start_date: params.startDate ?? null,
      created_by: params.actorUserId,
      ...(engagementTypeSlug ? { pipeline: resolveOnboardingPipeline(engagementTypeSlug) } : {}),
      ...(engagementTypeSlug ? { stage: stagesForPipeline(resolveOnboardingPipeline(engagementTypeSlug))[0] } : {}),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to start staff_onboarding", error?.message);
    return { ok: false, error: describeOnboardingStartError(error?.code) };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.started",
    entityType: "user",
    entityId: params.profileId,
    metadata: { requisitionId: params.requisitionId, hireOrigin: requisitionCheck.requisition.hireOrigin },
  });

  return { ok: true, onboardingId: data.id };
}

// Vendor Completion Phase (2026-09-15) — a SEPARATE start function for
// external-workforce relationships (vendor_supplier today; any future
// non-employee engagement type), deliberately never routed through
// startStaffOnboarding() above. That function's approved-requisition
// gate exists specifically to prevent an "orphan EMPLOYEE onboarding
// record with no approved hire definition" — a genuinely
// employee-shaped control (department headcount requisition ->
// approval) that does not fit a vendor/supplier relationship, and
// forcing one through it would mean either fabricating a requisition
// for a vendor or weakening that gate for employees. Neither is
// acceptable, so this is structurally its own function: same
// staff_onboarding table (reused, never duplicated), same
// canManageOnboarding() authorization tier, same unique(profile_id)
// constraint/error handling — just no requisition dependency.
// requisition_id is left null, exactly as it is for every historical
// record that predates the requisition-linking architecture (0080) —
// genuinely not applicable here, never backfilled with an invented
// value. pipeline/stage are set explicitly (never left to the table's
// own DEFAULT, which is the EMPLOYEE track's 'employee'/
// 'candidate_proposed' — see migration 0066).
export async function startExternalWorkforceOnboarding(params: {
  profileId: string;
  engagementTypeSlug: string;
  recruitmentApplicationId?: string | null;
  // Vendor QA correction (2026-09-15) — optional. requisition_id is
  // never REQUIRED here (no approval-gating logic runs against it,
  // unlike startStaffOnboarding()'s getApprovedRequisitionForOnboarding()),
  // but when a genuine, already-approved requisition exists for this
  // exact relationship (e.g. a Founder Direct Hire whose engagement
  // type happens to be vendor_supplier), the caller may pass its id
  // purely for lineage/audit — this function trusts the caller rather
  // than re-deriving/enforcing approval, since that enforcement
  // already happened wherever the requisition itself was approved.
  requisitionId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; onboardingId: string } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to onboard external workforce relationships." };
  }
  const pipeline = resolveOnboardingPipeline(params.engagementTypeSlug);
  if (pipeline === "employee") {
    return { ok: false, error: "This engagement type is a genuine employment classification — use the employee onboarding/requisition path instead." };
  }

  const admin = createAdminClient();
  const stages = stagesForPipeline(pipeline);
  const { data, error } = await admin
    .from("staff_onboarding")
    .insert({
      profile_id: params.profileId,
      recruitment_application_id: params.recruitmentApplicationId ?? null,
      requisition_id: params.requisitionId ?? null,
      pipeline,
      stage: stages[0],
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to start external workforce onboarding", error?.message);
    return { ok: false, error: describeOnboardingStartError(error?.code) };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.external_workforce_started",
    entityType: "user",
    entityId: params.profileId,
    metadata: { engagementTypeSlug: params.engagementTypeSlug, recruitmentApplicationId: params.recruitmentApplicationId ?? null, requisitionId: params.requisitionId ?? null },
  });

  return { ok: true, onboardingId: data.id };
}

// Vendor QA correction (2026-09-15) — a genuine data-entry correction
// tool, never a normal business operation: repairs a staff_onboarding
// record that was started on the WRONG relationship pipeline (e.g. a
// vendor accidentally routed through startStaffOnboarding() because
// the UI's engagement-type source was empty at the time — see the
// requisition-fallback fix on startStaffOnboarding() above, which
// prevents this going forward). Deliberately distinct from
// advanceOnboardingStage(), which explicitly REFUSES a cross-pipeline
// move (canAdvanceToStage() — correct for normal progression, wrong
// for correcting a mistake). Refuses once ANY onboarding_requirements
// row exists for this record — at that point the mistake has real
// recorded consequences and must be handled deliberately by a human,
// never silently reclassified out from under real history.
export async function correctOnboardingRelationshipClassification(params: {
  onboardingId: string;
  engagementTypeSlug: string;
  reason: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to correct an onboarding record's classification." };
  }
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required to correct an onboarding record's classification." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("staff_onboarding").select("id, profile_id, pipeline, stage, status").eq("id", params.onboardingId).maybeSingle();
  if (!existing) return { ok: false, error: "Onboarding record not found." };
  if (existing.status !== "in_progress") return { ok: false, error: "Only an in-progress onboarding record can be reclassified." };

  const { count } = await admin.from("onboarding_requirements").select("id", { count: "exact", head: true }).eq("onboarding_id", params.onboardingId);
  if (count && count > 0) {
    return { ok: false, error: "This onboarding record already has recorded requirement progress — reclassifying it now could hide real history. Resolve this manually instead." };
  }

  const newPipeline = resolveOnboardingPipeline(params.engagementTypeSlug);
  if (newPipeline === existing.pipeline) {
    return { ok: false, error: "This onboarding record is already on that pipeline." };
  }
  const stages = stagesForPipeline(newPipeline);

  const { error } = await admin
    .from("staff_onboarding")
    .update({ pipeline: newPipeline, stage: stages[0], stage_changed_at: new Date().toISOString(), stage_changed_by: params.actorUserId })
    .eq("id", params.onboardingId)
    .eq("pipeline", existing.pipeline); // atomic: only corrects if still on the expected wrong pipeline
  if (error) {
    console.error("[organization] failed to correct staff_onboarding relationship classification", error.message);
    return { ok: false, error: "Failed to correct the onboarding classification." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.relationship_classification_corrected",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { onboardingId: params.onboardingId, fromPipeline: existing.pipeline, toPipeline: newPipeline, engagementTypeSlug: params.engagementTypeSlug, reason },
  });

  return { ok: true };
}

// Reconciliation only (E.5 Stage 2M, Part 4/6) — links an EXISTING
// onboarding record (created before this architecture existed, e.g.
// Mishael Adjei's, started Stage 2G) to a since-created, approved
// requisition. Never creates a new onboarding record, never touches
// status/stage/pipeline, never fabricates a link — the requisition
// must already be approved and must not already be linked elsewhere,
// the exact same real check startStaffOnboarding() applies to a new
// record.
export async function linkOnboardingToRequisition(params: {
  onboardingId: string;
  requisitionId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to reconcile onboarding records." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("staff_onboarding").select("profile_id, requisition_id").eq("id", params.onboardingId).maybeSingle();
  if (!existing) return { ok: false, error: "Onboarding record not found." };
  if (existing.requisition_id) return { ok: false, error: "This onboarding record is already linked to a requisition." };

  const requisitionCheck = await getApprovedRequisitionForOnboarding(params.requisitionId, existing.profile_id);
  if (!requisitionCheck.ok) return { ok: false, error: requisitionCheck.error };

  const { error } = await admin.from("staff_onboarding").update({ requisition_id: params.requisitionId }).eq("id", params.onboardingId);
  if (error) {
    console.error("[organization] failed to link onboarding to requisition", error.message);
    return { ok: false, error: "Failed to link this onboarding record to the requisition." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.reconciled_with_requisition",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { onboardingId: params.onboardingId, requisitionId: params.requisitionId, hireOrigin: requisitionCheck.requisition.hireOrigin },
  });

  return { ok: true };
}

export async function completeStaffOnboarding(params: {
  onboardingId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to complete staff onboarding." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("staff_onboarding")
    .select("profile_id, pipeline, stage")
    .eq("id", params.onboardingId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Onboarding record not found." };

  // Completion safety (E.5 Stage 2I, Part G, 2026-09-11) — completing
  // onboarding is no longer an unconditional shortcut from any
  // in_progress stage. Two fail-closed checks, both ahead of the
  // atomic status transition below: the record must have actually
  // reached the terminal stage of its own resolved pipeline
  // (isTerminalStage(), pre-existing and previously unused), and every
  // REQUIRED requirement the current foundation knows about
  // (src/lib/organization/onboardingRequirements.ts) must be
  // satisfied/waived/not_applicable. Optional requirements never
  // block. Nothing here silently satisfies a missing requirement —
  // an unmet one simply refuses completion with a specific reason.
  const pipeline = existing.pipeline as OnboardingPipeline;
  if (!isTerminalStage(pipeline, existing.stage)) {
    return { ok: false, error: `Onboarding cannot be completed until it reaches the final stage of its pipeline (currently "${existing.stage}").` };
  }
  const unsatisfied = await getUnsatisfiedRequiredRequirements({
    onboardingId: params.onboardingId,
    profileId: existing.profile_id,
    pipeline,
  });
  if (unsatisfied.length > 0) {
    return {
      ok: false,
      error: `Onboarding cannot be completed while required items remain outstanding: ${unsatisfied.map((r) => r.label).join(", ")}.`,
    };
  }

  // Atomic idempotency guard (Phase J.2, same pattern already proven for
  // setProjectFileRetain()/promoteProjectFileToFinalApproved()/
  // recordManualPayment()) — only a row still 'in_progress' transitions;
  // a repeated "Complete" click (or two admins clicking at once) matches
  // zero rows on every call after the first and logs nothing extra.
  const { data: updated, error } = await admin
    .from("staff_onboarding")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", params.onboardingId)
    .eq("status", "in_progress")
    .select("id");
  if (error) {
    console.error("[organization] failed to complete staff_onboarding", error.message);
    return { ok: false, error: "Failed to complete onboarding." };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "This onboarding has already been completed." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.completed",
    entityType: "user",
    entityId: existing.profile_id,
  });

  return { ok: true };
}

// Onboarding stage pipeline (2026-09-07, Part 26/56) — moves a real
// onboarding record forward exactly one stage at a time within its own
// pipeline (canAdvanceToStage() refuses skipping, moving backward, or
// crossing pipelines). Never used to instantiate a fake onboarding
// record — this only advances an existing one, and Production has
// created none as of this phase (no fabricated staff/onboarding data).
export async function advanceOnboardingStage(params: {
  onboardingId: string;
  toStage: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to advance staff onboarding." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("staff_onboarding")
    .select("profile_id, pipeline, stage")
    .eq("id", params.onboardingId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Onboarding record not found." };

  if (!canAdvanceToStage(existing.pipeline as OnboardingPipeline, existing.stage, params.toStage)) {
    return { ok: false, error: `Cannot move from "${existing.stage}" directly to "${params.toStage}" — stages advance one at a time, forward only.` };
  }

  // Requirement gating (E.5 Stage 2I, Part J, 2026-09-11) — a stage
  // must not advance merely because an administrator can click "Next".
  // Every REQUIRED requirement that gates the CURRENT stage (not a
  // later one) must be satisfied/waived/not_applicable before moving
  // past it. This sits inside advanceOnboardingStage() itself, not
  // only in its caller's server action — the real boundary, matching
  // this codebase's own established pattern (assignStaffPosition()'s
  // staff-role guard, startStaffOnboarding()'s own authorization),
  // so it can't be bypassed by a future second caller.
  const unsatisfiedForStage = await getUnsatisfiedRequiredForStage({
    onboardingId: params.onboardingId,
    profileId: existing.profile_id,
    pipeline: existing.pipeline as OnboardingPipeline,
    stage: existing.stage,
  });
  if (unsatisfiedForStage.length > 0) {
    return {
      ok: false,
      error: `Cannot advance past "${existing.stage}" — required item(s) outstanding: ${unsatisfiedForStage.map((r) => r.label).join(", ")}.`,
    };
  }

  const { error } = await admin
    .from("staff_onboarding")
    .update({ stage: params.toStage, stage_changed_at: new Date().toISOString(), stage_changed_by: params.actorUserId })
    .eq("id", params.onboardingId)
    .eq("stage", existing.stage); // atomic: only advances if still at the expected prior stage
  if (error) {
    console.error("[organization] failed to advance staff_onboarding stage", error.message);
    return { ok: false, error: "Failed to advance the onboarding stage." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.stage_advanced",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { fromStage: existing.stage, toStage: params.toStage, pipeline: existing.pipeline },
  });

  // Staff-number controlled issuance (Founder decision, Workforce/
  // Employee Self-Service Phase, 2026-09-15): "issue the permanent
  // staff number automatically when the employee reaches Approved for
  // Hire." Implemented as a LEVEL check (the resulting stage is at or
  // past "approved_for_hire") rather than an edge listener for only the
  // literal transition into it — the two are identical for every future
  // employee advancing through the pipeline in order (both first become
  // true at the same transition), but the level check also correctly
  // and safely covers a real, already-existing onboarding record that
  // reached and moved past "approved_for_hire" before this rule
  // existed (e.g. Mishael Adjei, currently at "work_email"): their next
  // stage advance is the first time this check has ever run for them,
  // and they are, in fact, at or past Approved for Hire, so this is not
  // a different trigger — it is a correct, self-healing reading of the
  // same specified condition, avoiding a one-off backfill migration.
  // Never gates or fails the stage advance itself — Google Workspace/
  // corporate-identity provisioning must not block onboarding, and
  // neither should this (assignPermanentStaffNumberIfEligible is
  // idempotent, race-safe, and a no-op if a number already exists).
  if (existing.pipeline === "employee") {
    const stages = stagesForPipeline(existing.pipeline as OnboardingPipeline);
    const approvedForHireIndex = stages.indexOf("approved_for_hire" as OnboardingStage);
    const toStageIndex = stages.indexOf(params.toStage as OnboardingStage);
    if (approvedForHireIndex >= 0 && toStageIndex >= approvedForHireIndex) {
      const issuance = await assignPermanentStaffNumberIfEligible(existing.profile_id, params.actorUserId);
      if (!issuance.ok) {
        console.error("[organization] failed to auto-issue staff number on stage advance", issuance.error);
      }
    }
  }

  return { ok: true };
}
