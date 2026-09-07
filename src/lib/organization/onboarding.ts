import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { resolveOnboardingPipeline, canAdvanceToStage, type OnboardingPipeline } from "@/lib/organization/onboardingStages";

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
  corporateIdentityId: string | null;
  startDate: string | null;
  status: string;
  pipeline: OnboardingPipeline;
  stage: string;
  policiesAcceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

function mapOnboarding(r: {
  id: string;
  profile_id: string;
  recruitment_application_id: string | null;
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

const SELECT = "id, profile_id, recruitment_application_id, corporate_identity_id, start_date, status, pipeline, stage, policies_accepted_at, completed_at, created_at";

// Phase J.2 (2026-09-05) — startStaffOnboarding()/completeStaffOnboarding()
// had NO authorization check of their own before this phase (a real
// gap found while verifying this module ahead of wiring it into the
// Admin Portal — J.1 only confirmed the backend existed, not that it
// was safe to expose). Matches assignStaffPosition()'s exact boundary
// exactly, for consistency: Super Admin unrestricted, or a holder of
// the operations.administer capability (PRIME's package) — the same
// tier already trusted with routine organizational assignment. No new
// authorization concept introduced.
async function canManageOnboarding(actorUserId: string): Promise<boolean> {
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

export async function startStaffOnboarding(params: {
  profileId: string;
  recruitmentApplicationId?: string | null;
  startDate?: string | null;
  // Onboarding stage pipeline (2026-09-07, Part 26/56) — resolved from
  // the person's actual engagement classification, per explicit
  // instruction never to force employee-only stages onto a contractor/
  // vendor. Optional: callers that don't yet know the engagement type
  // fall back to the DB column's own default ('employee'), matching
  // this table's pre-existing default before this addition.
  engagementTypeSlug?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; onboardingId: string } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to onboard staff." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_onboarding")
    .insert({
      profile_id: params.profileId,
      recruitment_application_id: params.recruitmentApplicationId ?? null,
      start_date: params.startDate ?? null,
      created_by: params.actorUserId,
      ...(params.engagementTypeSlug ? { pipeline: resolveOnboardingPipeline(params.engagementTypeSlug) } : {}),
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
  });

  return { ok: true, onboardingId: data.id };
}

export async function completeStaffOnboarding(params: {
  onboardingId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to complete staff onboarding." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("staff_onboarding").select("profile_id").eq("id", params.onboardingId).maybeSingle();
  if (!existing) return { ok: false, error: "Onboarding record not found." };

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

  return { ok: true };
}
