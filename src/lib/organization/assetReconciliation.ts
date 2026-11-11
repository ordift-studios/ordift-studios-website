import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { validateFounderOwnership, validateOwnership, type FounderOwnershipInput, type OwnershipInput } from "./assetOwnershipRules";

// ASSET OWNERSHIP + ACQUISITION↔ASSET LINK (migration 0188). Super Admin only; every write is ONE audited database function. The asset register itself is NEVER written here (only read): its identifier, custody
// history and registration details stay exactly as they are. Linking creates no asset, no acquisition, no expense and no classification.
type Fail = { ok: false; error: string };
const DENIED: Fail = { ok: false, error: "Only a Super Admin can record asset ownership or link an acquisition to an asset." };
function friendly(m: string): string {
  if (/ownership_one_current/.test(m)) return "This asset already has a current ownership record. Void it first (only possible while no acquisition is linked).";
  if (/acquisitions_one_per_asset/.test(m)) return "Another recorded acquisition is already linked to this asset.";
  if (/cannot be changed or cleared/.test(m)) return "This acquisition is already linked to an asset; the link cannot be changed.";
  if (/no current ownership record/.test(m)) return "Record this asset's legal owner for this legal entity first.";
  if (/acquisition is linked/.test(m)) return "An acquisition is linked to this asset, so its ownership cannot be voided.";
  if (/THIS entity/.test(m)) return "The evidence document must be a financial document in the owning entity's own vault.";
  if (/not current/.test(m)) return "That ownership record is not current.";
  if (/ACTIVE Founder|no active Founder/.test(m)) return "Personal ownership can only be recorded for the active Founder identity.";
  if (/funding source is stated/.test(m)) return "A Founder-owned asset can be linked only to an acquisition whose funding source is stated.";
  if (/not linked to an asset/.test(m)) return "That acquisition is not linked to an asset.";
  if (/personal_use_note/.test(m)) return "Incidental personal use must be described.";
  return "The change could not be recorded.";
}

export async function recordAssetOwnership(p: { actorUserId: string; ownership: OwnershipInput }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const v = validateOwnership(p.ownership);
  if (!v.ok) return v;
  const { error } = await createAdminClient().rpc("record_asset_ownership", { p_asset: v.value.assetId, p_entity: v.value.entityId, p_purchaser: v.value.purchaserAsStated, p_purpose: v.value.businessPurpose, p_personal_use: v.value.incidentalPersonalUse, p_personal_note: v.value.personalUseNote, p_basis: v.value.basisStatement, p_evidence_doc: v.value.evidenceDocumentId, p_actor: p.actorUserId });
  if (error) { console.error("[asset ownership] record failed", error.message); return { ok: false, error: friendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "asset_ownership.recorded", entityType: "employing_entity", entityId: v.value.entityId, metadata: { assetId: v.value.assetId, incidentalPersonalUse: v.value.incidentalPersonalUse, reviewStatus: "pending_professional_review" } });
  return { ok: true };
}

export async function recordFounderAssetOwnership(p: { actorUserId: string; ownership: FounderOwnershipInput }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const v = validateFounderOwnership(p.ownership);
  if (!v.ok) return v;
  const { error } = await createAdminClient().rpc("record_founder_asset_ownership", { p_asset: v.value.assetId, p_entity: v.value.entityId, p_purchaser: v.value.purchaserAsStated, p_user: v.value.primaryUserAsStated, p_obligor: v.value.financingObligorAsStated, p_purpose: v.value.businessPurpose, p_company_funded: v.value.companyFunded, p_basis: v.value.basisStatement, p_evidence_doc: v.value.evidenceDocumentId, p_actor: p.actorUserId });
  if (error) { console.error("[asset ownership] founder record failed", error.message); return { ok: false, error: friendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "asset_ownership.recorded", entityType: "employing_entity", entityId: v.value.entityId, metadata: { assetId: v.value.assetId, ownerKind: "founder_personal", companyFunded: v.value.companyFunded, reviewStatus: "pending_professional_review" } });
  return { ok: true };
}

export async function unlinkAcquisitionFromAsset(p: { actorUserId: string; entityId: string; acquisitionId: string; reason: string }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a written reason of at least 10 characters." };
  const { data: a } = await createAdminClient().from("entity_equipment_acquisitions").select("employing_entity_id, company_asset_id").eq("id", p.acquisitionId).maybeSingle();
  if (!a || a.employing_entity_id !== p.entityId) return { ok: false, error: "That purchase does not belong to this legal entity." };
  if (!a.company_asset_id) return { ok: false, error: "That acquisition is not linked to an asset." };
  const { error } = await createAdminClient().rpc("unlink_acquisition_from_asset", { p_acquisition: p.acquisitionId, p_reason: p.reason.trim(), p_actor: p.actorUserId });
  if (error) { console.error("[asset unlink] failed", error.message); return { ok: false, error: friendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_asset.unlinked", entityType: "employing_entity", entityId: p.entityId, metadata: { acquisitionId: p.acquisitionId, assetId: a.company_asset_id } });
  return { ok: true };
}

export async function voidAssetOwnership(p: { actorUserId: string; entityId: string; ownershipId: string; reason: string }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a written reason of at least 10 characters." };
  const { data: o } = await createAdminClient().from("entity_asset_ownership").select("employing_entity_id").eq("id", p.ownershipId).maybeSingle();
  if (!o || o.employing_entity_id !== p.entityId) return { ok: false, error: "That ownership record does not belong to this legal entity." };
  const { error } = await createAdminClient().rpc("void_asset_ownership", { p_ownership: p.ownershipId, p_reason: p.reason.trim(), p_actor: p.actorUserId });
  if (error) { console.error("[asset ownership] void failed", error.message); return { ok: false, error: friendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "asset_ownership.voided", entityType: "employing_entity", entityId: p.entityId, metadata: { ownershipId: p.ownershipId } });
  return { ok: true };
}

export async function linkAcquisitionToAsset(p: { actorUserId: string; entityId: string; acquisitionId: string; assetId: string }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const { data: a } = await createAdminClient().from("entity_equipment_acquisitions").select("employing_entity_id, status").eq("id", p.acquisitionId).maybeSingle();
  if (!a || a.status !== "recorded" || a.employing_entity_id !== p.entityId) return { ok: false, error: "That purchase does not belong to this legal entity." };
  const { error } = await createAdminClient().rpc("link_acquisition_to_asset", { p_acquisition: p.acquisitionId, p_asset: p.assetId, p_actor: p.actorUserId });
  if (error) { console.error("[asset link] failed", error.message); return { ok: false, error: friendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_asset.linked", entityType: "employing_entity", entityId: p.entityId, metadata: { acquisitionId: p.acquisitionId, assetId: p.assetId } });
  return { ok: true };
}

export type AssetRow = { id: string; identifier: string; description: string; category: string | null; status: string; ownership: { id: string; entityId: string; ownerKind: "legal_entity" | "founder_personal"; companyFunded: boolean; primaryUser: string | null; financingObligor: string | null; excludedFromCompanyFixedAssets: boolean; purchaser: string | null; purpose: string; incidentalPersonalUse: boolean; personalUseNote: string | null; basis: string; reviewStatus: string } | null; linkedAcquisitionId: string | null };
// Read-only: the registered assets with their CURRENT ownership record (if any) and the recorded acquisition linked to them (if any). Super Admin only; before 0188 is applied this returns [].
export async function loadAssetRegister(actorUserId: string): Promise<AssetRow[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const db = createAdminClient();
  const [assets, own, acq] = await Promise.all([
    db.from("company_assets").select("id, asset_identifier, description, category, status").order("created_at"),
    db.from("entity_asset_ownership").select("id, asset_id, employing_entity_id, purchaser_as_stated, business_purpose, incidental_personal_use, personal_use_note, basis_statement, review_status, owner_kind, company_funded, primary_user_as_stated, financing_obligor_as_stated, excluded_from_company_fixed_assets").eq("status", "current"),
    db.from("entity_equipment_acquisitions").select("id, company_asset_id").eq("status", "recorded"),
  ]);
  if (assets.error || own.error || acq.error) return [];
  return (assets.data ?? []).map((a) => {
    const o = (own.data ?? []).find((x) => x.asset_id === a.id);
    const l = (acq.data ?? []).find((x) => x.company_asset_id === a.id);
    return { id: a.id as string, identifier: a.asset_identifier as string, description: a.description as string, category: (a.category as string | null) ?? null, status: a.status as string,
      ownership: o ? { id: o.id as string, entityId: o.employing_entity_id as string, ownerKind: ((o.owner_kind as string | undefined) === "founder_personal" ? "founder_personal" : "legal_entity"), companyFunded: Boolean(o.company_funded), primaryUser: (o.primary_user_as_stated as string | null) ?? null, financingObligor: (o.financing_obligor_as_stated as string | null) ?? null, excludedFromCompanyFixedAssets: Boolean(o.excluded_from_company_fixed_assets), purchaser: (o.purchaser_as_stated as string | null) ?? null, purpose: o.business_purpose as string, incidentalPersonalUse: Boolean(o.incidental_personal_use), personalUseNote: (o.personal_use_note as string | null) ?? null, basis: o.basis_statement as string, reviewStatus: o.review_status as string } : null,
      linkedAcquisitionId: (l?.id as string | undefined) ?? null };
  });
}
