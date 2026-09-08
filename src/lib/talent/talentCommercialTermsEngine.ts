import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { validateCommercialTerms, type TalentCommissionType } from "./talentCommercialTerms";

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08). DB-backed
// commercial-terms engine. Gated by the DORMANT
// talent.commercial_terms.administer capability. No function here
// ever supplies a default commission value — validateCommercialTerms()
// (pure) refuses any call that omits one where one is required.

async function requireCommercialTermsAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.commercialTermsAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent commercial terms." };
  return { ok: true };
}

export async function setCommercialTerms(params: {
  profileId: string;
  commissionType: TalentCommissionType;
  commissionValue: number | null;
  currency: string | null;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireCommercialTermsAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const validation = validateCommercialTerms({ commissionType: params.commissionType, commissionValue: params.commissionValue, currency: params.currency });
  if (!validation.ok) return validation;

  const admin = createAdminClient();
  const { error } = await admin.from("talent_commercial_terms").upsert(
    {
      profile_id: params.profileId,
      commission_type: params.commissionType,
      commission_value: params.commissionValue,
      currency: params.currency,
      notes: params.notes ?? null,
      set_at: new Date().toISOString(),
      set_by: params.actorUserId,
    },
    { onConflict: "profile_id" },
  );
  if (error) {
    console.error("[talent] failed to set commercial terms", error.message);
    return { ok: false, error: "Failed to save commercial terms." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "talent.commercial_terms.set",
    entityType: "profile",
    entityId: params.profileId,
    metadata: { commissionType: params.commissionType },
    // commissionValue deliberately excluded from metadata — a real
    // negotiated financial figure, not something to fan out into a
    // general activity feed beyond "what type of term was set."
  });

  return { ok: true };
}
