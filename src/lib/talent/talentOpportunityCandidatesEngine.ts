import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { isValidCandidacyTransition, type TalentCandidacyStatus } from "./talentCandidacyLifecycle";

// Ordift Talent — Opportunity Candidacy (2026-09-09). DB-backed
// candidacy engine over public.talent_opportunity_candidates (schema
// migration 0075). Reuses the existing, DORMANT
// talent.opportunity.administer capability — candidacy management is
// opportunity administration, not a new authorization concern, per
// explicit instruction not to invent a parallel model.
//
// No function here creates an engagement, payment_obligation, or any
// Payables record — reaching "booked" is a candidacy-lifecycle
// transition only. A future, separate, deliberate staff action is what
// would create a real engagement, using engagements' own existing
// entity_type/entity_id columns (migration 0049) to reference back to
// the candidacy — nothing in that bridge is implemented here.

async function requireOpportunityAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.opportunityAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent opportunities." };
  return { ok: true };
}

export async function addCandidateToOpportunity(params: {
  opportunityId: string;
  profileId: string;
  actorUserId: string;
}): Promise<{ ok: true; candidacyId: string } | { ok: false; error: string }> {
  const auth = await requireOpportunityAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_opportunity_candidates")
    .insert({ opportunity_id: params.opportunityId, profile_id: params.profileId, created_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) {
    // Duplicate protection: the DB unique(opportunity_id, profile_id)
    // constraint (migration 0075) rejects a repeat add with Postgres
    // SQLSTATE 23505 (unique_violation) — surfaced as a clear,
    // human-readable message rather than the raw constraint-name text.
    // This is a backstop, not the primary defense: the caller
    // (AddCandidateForm.tsx, via listAvailableCandidatesForProfile...
    // see talentOverview.ts) only ever offers people not already a
    // candidate for this opportunity, same two-layer pattern already
    // used for talent_profile_categories.
    if (error?.code === "23505") return { ok: false, error: "This talent is already a candidate for this opportunity." };
    console.error("[talent] failed to add opportunity candidate", error?.message);
    return { ok: false, error: "Failed to add the candidate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "talent.opportunity.candidate_added",
    entityType: "talent_opportunity_candidate",
    entityId: data.id,
    metadata: { opportunityId: params.opportunityId, profileId: params.profileId },
  });
  return { ok: true, candidacyId: data.id };
}

// Atomic compare-and-swap — same idempotency pattern as
// setRepresentationStatus()/transitionOpportunityStatus() and every
// other lifecycle transition in this codebase. No delete function
// exists in this engine, deliberately: a candidacy is meaningful
// business history (agreed with the Founder), so the normal way a
// candidacy ends is a status transition (declined/unavailable/
// withdrawn), never a row deletion.
export async function transitionCandidateStatus(params: {
  candidacyId: string;
  toStatus: TalentCandidacyStatus;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOpportunityAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("talent_opportunity_candidates").select("id, status").eq("id", params.candidacyId).maybeSingle();
  if (!existing) return { ok: false, error: "Candidacy not found." };

  const fromStatus = existing.status as TalentCandidacyStatus;
  if (!isValidCandidacyTransition(fromStatus, params.toStatus)) {
    return { ok: false, error: `Cannot move this candidate from "${fromStatus}" to "${params.toStatus}".` };
  }

  const { error } = await admin
    .from("talent_opportunity_candidates")
    .update({ status: params.toStatus, status_changed_at: new Date().toISOString(), status_changed_by: params.actorUserId })
    .eq("id", params.candidacyId)
    .eq("status", fromStatus);
  if (error) {
    console.error("[talent] failed to transition candidate status", error.message);
    return { ok: false, error: "Failed to update candidate status." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "talent.opportunity.candidate_status_changed",
    entityType: "talent_opportunity_candidate",
    entityId: params.candidacyId,
    metadata: { fromStatus, toStatus: params.toStatus },
  });
  return { ok: true };
}
