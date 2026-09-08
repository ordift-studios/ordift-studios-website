import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { isValidOpportunityTransition, type TalentOpportunityStatus } from "./talentOpportunityLifecycle";

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08). DB-backed
// internal opportunity/casting foundation. Gated by the DORMANT
// talent.opportunity.administer capability. Nothing in this file
// exposes an opportunity publicly or accepts an external application —
// that is explicitly out of scope for this foundation phase.

async function requireOpportunityAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.opportunityAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent opportunities." };
  return { ok: true };
}

export async function createOpportunity(params: {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; opportunityId: string } | { ok: false; error: string }> {
  const auth = await requireOpportunityAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_opportunities")
    .insert({ title: params.title, description: params.description ?? null, category_id: params.categoryId ?? null, created_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[talent] failed to create talent opportunity", error?.message);
    return { ok: false, error: "Failed to create the opportunity." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.opportunity.created", entityType: "talent_opportunity", entityId: data.id, metadata: { title: params.title } });
  return { ok: true, opportunityId: data.id };
}

export async function transitionOpportunityStatus(params: {
  opportunityId: string;
  toStatus: TalentOpportunityStatus;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOpportunityAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("talent_opportunities").select("id, status").eq("id", params.opportunityId).maybeSingle();
  if (!existing) return { ok: false, error: "Opportunity not found." };

  const fromStatus = existing.status as TalentOpportunityStatus;
  if (!isValidOpportunityTransition(fromStatus, params.toStatus)) {
    return { ok: false, error: `Cannot move an opportunity from "${fromStatus}" to "${params.toStatus}".` };
  }

  const { error } = await admin.from("talent_opportunities").update({ status: params.toStatus }).eq("id", params.opportunityId).eq("status", fromStatus);
  if (error) {
    console.error("[talent] failed to transition opportunity status", error.message);
    return { ok: false, error: "Failed to update the opportunity status." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.opportunity.status_changed", entityType: "talent_opportunity", entityId: params.opportunityId, metadata: { fromStatus, toStatus: params.toStatus } });
  return { ok: true };
}
