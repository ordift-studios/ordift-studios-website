import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 14 (2026-09-14) —
// conflicts of interest, outside work, and gifts/hospitality,
// OS-HR-GH-004 section 4. Anti-bribery reporting (4.3) reuses the
// existing speak_up_reports channel (migration 0089) rather than a new
// table — nothing in this file writes a bribery/kickback report.

async function canManageConflictsGifts(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// --- outside work / conflicts of interest (4.1) -------------------------

export async function submitOutsideWorkDisclosure(params: { profileId: string; description: string; actorUserId: string }): Promise<{ ok: true; disclosureId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManageConflictsGifts(params.actorUserId))) {
    return { ok: false, error: "Not authorized to submit a disclosure on behalf of another person." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("outside_work_disclosures").insert({ profile_id: params.profileId, description: params.description }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the disclosure." };

  await logActivity({ actorUserId: params.actorUserId, action: "outside_work_disclosure.submitted", entityType: "user", entityId: params.profileId, metadata: { disclosureId: data.id } });
  return { ok: true, disclosureId: data.id };
}

export type OutsideWorkDisclosureDecision = "approved" | "declined";

export async function decideOutsideWorkDisclosure(params: { disclosureId: string; decision: OutsideWorkDisclosureDecision; decisionNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageConflictsGifts(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide an outside-work disclosure." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("outside_work_disclosures")
    .update({ status: params.decision, decided_by: params.actorUserId, decided_at: new Date().toISOString(), decision_notes: params.decisionNotes ?? null })
    .eq("id", params.disclosureId)
    .eq("status", "disclosed")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the disclosure." };
  if (!data) return { ok: false, error: "Disclosure not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "outside_work_disclosure.decided", entityType: "user", entityId: data.profile_id, metadata: { disclosureId: params.disclosureId, decision: params.decision } });
  return { ok: true };
}

export async function listOutsideWorkDisclosuresForProfile(profileId: string): Promise<{ id: string; description: string; status: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("outside_work_disclosures").select("id, description, status").eq("profile_id", profileId).order("disclosed_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load outside_work_disclosures", error.message);
    return [];
  }
  return data ?? [];
}

// --- gift/hospitality thresholds (4.2, CONFIGURATION REQUIRED) ----------

// Pure — compares a declared value against a configured threshold.
// Returns null (not false) when no threshold is configured — a
// declareGiftOrHospitality() caller must never see a false "within
// limits" answer manufactured from an absent configuration.
export function compareGiftValueAgainstThreshold(value: number | null, thresholdAmount: number | null): boolean | null {
  if (value === null || thresholdAmount === null) return null;
  return value > thresholdAmount;
}

export async function configureGiftHospitalityThreshold(params: {
  jurisdiction: string;
  employingEntityId?: string | null;
  thresholdAmount: number;
  currency: string;
  effectiveFrom: string;
  notes: string;
  actorUserId: string;
}): Promise<{ ok: true; thresholdId: string } | { ok: false; error: string }> {
  if (!(await canManageConflictsGifts(params.actorUserId))) {
    return { ok: false, error: "Not authorized to configure a gift/hospitality threshold." };
  }
  if (!params.notes.trim()) return { ok: false, error: "A documented source/basis for this threshold is required." };
  if (!(params.thresholdAmount > 0)) return { ok: false, error: "The threshold amount must be greater than zero." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gift_hospitality_thresholds")
    .insert({
      jurisdiction: params.jurisdiction,
      employing_entity_id: params.employingEntityId ?? null,
      threshold_amount: params.thresholdAmount,
      currency: params.currency,
      effective_from: params.effectiveFrom,
      notes: params.notes,
      configured_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to configure the threshold." };
  return { ok: true, thresholdId: data.id };
}

export async function getCurrentGiftHospitalityThreshold(params: { jurisdiction: string; employingEntityId?: string | null; asOfDate?: string }): Promise<{ id: string; thresholdAmount: number; currency: string } | null> {
  const admin = createAdminClient();
  let query = admin
    .from("gift_hospitality_thresholds")
    .select("id, threshold_amount, currency, effective_from")
    .eq("jurisdiction", params.jurisdiction)
    .lte("effective_from", params.asOfDate ?? new Date().toISOString().slice(0, 10))
    .order("effective_from", { ascending: false })
    .limit(1);
  query = params.employingEntityId ? query.eq("employing_entity_id", params.employingEntityId) : query.is("employing_entity_id", null);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return { id: data.id, thresholdAmount: data.threshold_amount, currency: data.currency };
}

// --- gift/hospitality declarations (4.2) ---------------------------------

export type GiftHospitalityDirection = "given" | "received";

// exceeds_threshold is always derived via compareGiftValueAgainstThreshold()
// from whatever getCurrentGiftHospitalityThreshold() actually finds —
// never a caller-supplied value, and honestly null when nothing is
// configured yet for this jurisdiction/entity.
export async function declareGiftOrHospitality(params: {
  profileId: string;
  direction: GiftHospitalityDirection;
  description: string;
  counterparty: string;
  estimatedValue?: number | null;
  currency?: string | null;
  occurredAt?: string | null;
  businessJustification?: string | null;
  jurisdiction: string;
  employingEntityId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; declarationId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManageConflictsGifts(params.actorUserId))) {
    return { ok: false, error: "Not authorized to declare a gift/hospitality item on behalf of another person." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description is required." };
  if (!params.counterparty.trim()) return { ok: false, error: "The counterparty must be identified." };

  const threshold = await getCurrentGiftHospitalityThreshold({ jurisdiction: params.jurisdiction, employingEntityId: params.employingEntityId, asOfDate: params.occurredAt ?? undefined });
  const exceedsThreshold = compareGiftValueAgainstThreshold(params.estimatedValue ?? null, threshold?.thresholdAmount ?? null);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gift_hospitality_declarations")
    .insert({
      profile_id: params.profileId,
      declared_by: params.actorUserId,
      direction: params.direction,
      description: params.description,
      counterparty: params.counterparty,
      estimated_value: params.estimatedValue ?? null,
      currency: params.currency ?? null,
      occurred_at: params.occurredAt ?? null,
      business_justification: params.businessJustification ?? null,
      applicable_threshold_id: threshold?.id ?? null,
      exceeds_threshold: exceedsThreshold,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to declare the gift/hospitality item." };

  await logActivity({ actorUserId: params.actorUserId, action: "gift_hospitality_declaration.declared", entityType: "user", entityId: params.profileId, metadata: { declarationId: data.id, direction: params.direction, exceedsThreshold } });
  return { ok: true, declarationId: data.id };
}

export type GiftHospitalityReviewDecision = "approved" | "declined" | "flagged";

export async function reviewGiftHospitalityDeclaration(params: { declarationId: string; decision: GiftHospitalityReviewDecision; reviewNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageConflictsGifts(params.actorUserId))) {
    return { ok: false, error: "Not authorized to review a gift/hospitality declaration." };
  }
  if (!params.reviewNotes.trim()) return { ok: false, error: "Review notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gift_hospitality_declarations")
    .update({ status: params.decision, reviewed_by: params.actorUserId, reviewed_at: new Date().toISOString(), review_notes: params.reviewNotes })
    .eq("id", params.declarationId)
    .eq("status", "declared")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to review the declaration." };
  if (!data) return { ok: false, error: "Declaration not found, or already reviewed." };

  await logActivity({ actorUserId: params.actorUserId, action: "gift_hospitality_declaration.reviewed", entityType: "user", entityId: data.profile_id, metadata: { declarationId: params.declarationId, decision: params.decision } });
  return { ok: true };
}

export async function listGiftHospitalityDeclarationsForProfile(profileId: string): Promise<{ id: string; direction: string; description: string; status: string; exceedsThreshold: boolean | null }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gift_hospitality_declarations")
    .select("id, direction, description, status, exceeds_threshold")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load gift_hospitality_declarations", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, direction: r.direction, description: r.description, status: r.status, exceedsThreshold: r.exceeds_threshold }));
}
