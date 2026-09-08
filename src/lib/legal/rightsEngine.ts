import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { isIssuedAgreementStatus, type AgreementLifecycleStatus } from "./agreementLifecycle";
import {
  createDefaultReleaseRights,
  validateReleaseRights,
  isReleaseMasterCode,
  type ReleaseRights,
  type UsageRightsCategory,
  type AiSyntheticRightsCategory,
  type RightsTerritory,
  type RightsDuration,
} from "./rightsCatalogue";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase G (2026-09-08).
// DB-backed Releases/Rights engine for OS-LGL-004/005/006. Gated by
// GOVERNANCE_CAPABILITIES.contractAdminister — the same capability
// already governing every other agreement-administration action in
// this Legal Suite. No real release has been granted in Production by
// this phase.

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer legal releases." };
  return { ok: true };
}

export type SetAgreementReleaseRightsParams = {
  agreementId: string;
  usageRights?: Partial<Record<UsageRightsCategory, boolean>>;
  aiSyntheticRights?: Partial<Record<AiSyntheticRightsCategory, boolean>>;
  territory?: RightsTerritory | null;
  territoryDetail?: string | null;
  duration?: RightsDuration | null;
  durationEndDate?: string | null;
  actorUserId: string;
};

// Upserts the release-rights row for an agreement. Every insert starts
// from createDefaultReleaseRights() (everything NOT GRANTED) and only
// the categories the caller explicitly names are changed — there is no
// "grant all" shortcut and no implicit default-to-true anywhere in
// this function. Refuses once the agreement has been issued (Part:
// post-issue changes go through agreement_amendments instead).
export async function setAgreementReleaseRights(params: SetAgreementReleaseRightsParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: agreement } = await admin.from("agreements").select("id, status, master_id").eq("id", params.agreementId).maybeSingle();
  if (!agreement) return { ok: false, error: "Agreement not found." };
  if (isIssuedAgreementStatus(agreement.status as AgreementLifecycleStatus)) {
    return { ok: false, error: "This agreement has already been issued — record a rights change via an amendment instead of editing the release directly." };
  }

  const { data: master } = await admin.from("legal_document_masters").select("code").eq("id", agreement.master_id).maybeSingle();
  if (!master || !isReleaseMasterCode(master.code)) {
    return { ok: false, error: "This agreement's master is not a release/licence document (OS-LGL-004/005/006)." };
  }

  const { data: existingRow } = await admin.from("agreement_releases").select("*").eq("agreement_id", params.agreementId).maybeSingle();
  const current: ReleaseRights = existingRow
    ? {
        usage: existingRow.usage_rights,
        aiSynthetic: existingRow.ai_synthetic_rights,
        territory: existingRow.territory,
        territoryDetail: existingRow.territory_detail,
        duration: existingRow.duration,
        durationEndDate: existingRow.duration_end_date,
      }
    : createDefaultReleaseRights();

  const next: ReleaseRights = {
    usage: { ...current.usage, ...(params.usageRights ?? {}) },
    aiSynthetic: { ...current.aiSynthetic, ...(params.aiSyntheticRights ?? {}) },
    territory: params.territory !== undefined ? params.territory : current.territory,
    territoryDetail: params.territoryDetail !== undefined ? params.territoryDetail : current.territoryDetail,
    duration: params.duration !== undefined ? params.duration : current.duration,
    durationEndDate: params.durationEndDate !== undefined ? params.durationEndDate : current.durationEndDate,
  };

  const validation = validateReleaseRights(next);
  if (!validation.ok) return validation;

  const row = {
    agreement_id: params.agreementId,
    master_code: master.code,
    usage_rights: next.usage,
    ai_synthetic_rights: next.aiSynthetic,
    territory: next.territory,
    territory_detail: next.territoryDetail,
    duration: next.duration,
    duration_end_date: next.durationEndDate,
    granted_at: new Date().toISOString(),
    granted_by: params.actorUserId,
  };

  const { error } = await admin.from("agreement_releases").upsert(row, { onConflict: "agreement_id" });
  if (error) {
    console.error("[legal] failed to set agreement release rights", error.message);
    return { ok: false, error: "Failed to save the release rights." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.release.granted",
    entityType: "agreement",
    entityId: params.agreementId,
    metadata: { masterCode: master.code, usageRightsGranted: Object.entries(next.usage).filter(([, v]) => v).map(([k]) => k), aiSyntheticRightsGranted: Object.entries(next.aiSynthetic).filter(([, v]) => v).map(([k]) => k) },
  });

  return { ok: true };
}

export async function getAgreementReleaseRights(agreementId: string): Promise<ReleaseRights | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("agreement_releases").select("*").eq("agreement_id", agreementId).maybeSingle();
  if (!data) return null;
  return {
    usage: data.usage_rights,
    aiSynthetic: data.ai_synthetic_rights,
    territory: data.territory,
    territoryDetail: data.territory_detail,
    duration: data.duration,
    durationEndDate: data.duration_end_date,
  };
}
