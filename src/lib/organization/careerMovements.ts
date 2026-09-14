import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { recordEmploymentTermsSnapshot } from "@/lib/organization/employmentTermsHistory";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 16 (2026-09-14),
// updated Phase B5 Step 1 (2026-09-14) — promotion and transfers,
// OS-HR-GH-003 section 8. Every function that actually applies a
// position/grade/entity/department change delegates to the existing
// recordEmploymentTermsSnapshot() (employmentTermsHistory.ts, migration
// 0086) — this file never writes those columns itself, so there is
// exactly one place in the codebase that can change a person's
// recorded terms.
//
// Acting appointments (8.2) are no longer covered by this file — the
// schema reconciliation (migration 0104) retired the acting_appointments
// table in favor of extending the pre-existing, already-UI-connected
// acting_assignments table (migration 0065); see
// src/lib/organization/actingAssignments.ts for that logic now.

async function canManageCareerMovements(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// --- promotions (8.1) ----------------------------------------------------

// remuneration_review_required is always computed here from whether
// the grade is actually changing — never a caller-supplied value.
// "no predetermined increase" (8.1): this function never sets a
// basic_salary value; a real remuneration change is a separate, later,
// explicit recordEmploymentTermsSnapshot() call.
export async function recordPromotion(params: {
  profileId: string;
  fromPositionId?: string | null;
  toPositionId?: string | null;
  fromGradeId?: string | null;
  toGradeId?: string | null;
  basis: string;
  effectiveDate: string;
  actorUserId: string;
}): Promise<{ ok: true; promotionId: string } | { ok: false; error: string }> {
  if (!(await canManageCareerMovements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a promotion." };
  }
  if (!params.basis.trim()) return { ok: false, error: "The basis for this promotion is required." };

  const remunerationReviewRequired = (params.toGradeId ?? null) !== (params.fromGradeId ?? null);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promotions")
    .insert({
      profile_id: params.profileId,
      from_position_id: params.fromPositionId ?? null,
      to_position_id: params.toPositionId ?? null,
      from_grade_id: params.fromGradeId ?? null,
      to_grade_id: params.toGradeId ?? null,
      basis: params.basis,
      remuneration_review_required: remunerationReviewRequired,
      effective_date: params.effectiveDate,
      approved_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the promotion." };

  const snapshot = await recordEmploymentTermsSnapshot({
    profileId: params.profileId,
    effectiveFrom: params.effectiveDate,
    changes: { positionId: params.toPositionId ?? undefined, gradeId: params.toGradeId ?? undefined },
    source: "promotion",
    recordedBy: params.actorUserId,
  });
  if (!snapshot.ok) {
    return { ok: false, error: `Promotion recorded, but applying the position/grade change failed: ${snapshot.error}` };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "promotion.recorded", entityType: "user", entityId: params.profileId, metadata: { promotionId: data.id, remunerationReviewRequired } });
  return { ok: true, promotionId: data.id };
}

export async function completePromotionRemunerationReview(params: { promotionId: string; reviewNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageCareerMovements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to complete a promotion's remuneration review." };
  }
  if (!params.reviewNotes.trim()) return { ok: false, error: "Review notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promotions")
    .update({ remuneration_review_completed: true, remuneration_review_notes: params.reviewNotes })
    .eq("id", params.promotionId)
    .eq("remuneration_review_required", true)
    .eq("remuneration_review_completed", false)
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to complete the remuneration review." };
  if (!data) return { ok: false, error: "Promotion not found, does not require a remuneration review, or already reviewed." };

  await logActivity({ actorUserId: params.actorUserId, action: "promotion.remuneration_review_completed", entityType: "user", entityId: data.profile_id, metadata: { promotionId: params.promotionId } });
  return { ok: true };
}

export async function listPromotionsForProfile(profileId: string): Promise<{ id: string; basis: string; effectiveDate: string; remunerationReviewRequired: boolean; remunerationReviewCompleted: boolean }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promotions")
    .select("id, basis, effective_date, remuneration_review_required, remuneration_review_completed")
    .eq("profile_id", profileId)
    .order("effective_date", { ascending: false });
  if (error) {
    console.error("[organization] failed to load promotions", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, basis: r.basis, effectiveDate: r.effective_date, remunerationReviewRequired: r.remuneration_review_required, remunerationReviewCompleted: r.remuneration_review_completed }));
}

// --- staff transfers (8.3) -------------------------------------------------

export const STAFF_TRANSFER_TYPES = ["same_entity_same_jurisdiction", "inter_entity", "international"] as const;
export type StaffTransferType = (typeof STAFF_TRANSFER_TYPES)[number];

export async function requestStaffTransfer(params: {
  profileId: string;
  transferType: StaffTransferType;
  fromEmployingEntityId?: string | null;
  toEmployingEntityId?: string | null;
  fromDepartmentId?: string | null;
  toDepartmentId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  if (!(await canManageCareerMovements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to request a staff transfer." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_transfers")
    .insert({
      profile_id: params.profileId,
      transfer_type: params.transferType,
      from_employing_entity_id: params.fromEmployingEntityId ?? null,
      to_employing_entity_id: params.toEmployingEntityId ?? null,
      from_department_id: params.fromDepartmentId ?? null,
      to_department_id: params.toDepartmentId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to request the transfer." };

  await logActivity({ actorUserId: params.actorUserId, action: "staff_transfer.requested", entityType: "user", entityId: params.profileId, metadata: { transferId: data.id, transferType: params.transferType } });
  return { ok: true, transferId: data.id };
}

export async function recordStaffTransferChecks(params: {
  transferId: string;
  writtenNoticeProvided?: boolean;
  materialConsentObtained?: boolean;
  enhancedReviewCompleted?: boolean;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageCareerMovements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record transfer checks." };
  }
  const update: Record<string, boolean> = {};
  if (params.writtenNoticeProvided !== undefined) update.written_notice_provided = params.writtenNoticeProvided;
  if (params.materialConsentObtained !== undefined) update.material_consent_obtained = params.materialConsentObtained;
  if (params.enhancedReviewCompleted !== undefined) update.enhanced_review_completed = params.enhancedReviewCompleted;
  if (Object.keys(update).length === 0) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin.from("staff_transfers").update(update).eq("id", params.transferId).eq("status", "requested");
  if (error) return { ok: false, error: "Failed to record the transfer checks." };
  return { ok: true };
}

// Inter-entity/international transfers require enhanced_review_completed
// before they can be completed — OS-HR-GH-003 8.3: "Inter-entity or
// international transfers require enhanced review." Completing always
// delegates the actual entity/department change to the existing
// recordEmploymentTermsSnapshot() — never a silent change (8.3: "must
// not silently change employer... payroll, tax, benefits or governing
// law").
export async function completeStaffTransfer(params: { transferId: string; effectiveDate: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageCareerMovements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to complete a staff transfer." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("staff_transfers")
    .select("id, profile_id, transfer_type, to_employing_entity_id, to_department_id, enhanced_review_completed, status")
    .eq("id", params.transferId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Transfer not found." };
  if (existing.status === "completed") return { ok: false, error: "This transfer has already been completed." };
  if (existing.transfer_type !== "same_entity_same_jurisdiction" && !existing.enhanced_review_completed) {
    return { ok: false, error: "Enhanced review must be completed before an inter-entity or international transfer can be completed." };
  }

  const { data, error } = await admin
    .from("staff_transfers")
    .update({ status: "completed", approved_by: params.actorUserId, approved_at: new Date().toISOString(), effective_date: params.effectiveDate })
    .eq("id", params.transferId)
    .neq("status", "completed")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to complete the transfer." };
  if (!data) return { ok: false, error: "The transfer changed concurrently — please retry." };

  const snapshot = await recordEmploymentTermsSnapshot({
    profileId: existing.profile_id,
    effectiveFrom: params.effectiveDate,
    changes: { employingEntityId: existing.to_employing_entity_id ?? undefined, departmentId: existing.to_department_id ?? undefined },
    source: "staff_transfer",
    recordedBy: params.actorUserId,
  });
  if (!snapshot.ok) {
    return { ok: false, error: `Transfer marked completed, but applying the entity/department change failed: ${snapshot.error}` };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "staff_transfer.completed", entityType: "user", entityId: existing.profile_id, metadata: { transferId: params.transferId } });
  return { ok: true };
}

export async function listStaffTransfersForProfile(profileId: string): Promise<{ id: string; transferType: string; status: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_transfers").select("id, transfer_type, status").eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load staff_transfers", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, transferType: r.transfer_type, status: r.status }));
}
