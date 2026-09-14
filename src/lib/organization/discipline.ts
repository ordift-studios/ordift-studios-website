import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 4 (2026-09-14) —
// discipline / investigation / investigatory-suspension. No automatic
// termination path exists anywhere in this file (OS-HR-GH-004 5.1: "No
// automatic termination rules"). Authorization reuses the established
// Super-Admin/operations.administer tier — no new concept.

export const DISCIPLINARY_ACTION_TYPES = ["informal_intervention", "first_written_warning", "final_written_warning", "further_action"] as const;
export type DisciplinaryActionType = (typeof DISCIPLINARY_ACTION_TYPES)[number];

// Pure — the real approved validity periods (OS-HR-GH-004 5.1: first
// written warning "normally active 6 months", final written warning
// "normally active 12 months"). informal_intervention/further_action
// have no stated fixed validity — null, never guessed.
export function computeDisciplinaryActionActiveUntil(actionType: DisciplinaryActionType, issuedAtIso: string): string | null {
  const issued = new Date(issuedAtIso);
  if (actionType === "first_written_warning") {
    const activeUntil = new Date(issued);
    activeUntil.setUTCMonth(activeUntil.getUTCMonth() + 6);
    return activeUntil.toISOString().slice(0, 10);
  }
  if (actionType === "final_written_warning") {
    const activeUntil = new Date(issued);
    activeUntil.setUTCMonth(activeUntil.getUTCMonth() + 12);
    return activeUntil.toISOString().slice(0, 10);
  }
  return null;
}

// Pure — "currently active" is always computed at read time, never a
// stored, job-maintained status. A null activeUntil (informal_intervention/
// further_action) is treated as indefinitely active (this policy states
// no expiry for those types) — genuinely different from "expired",
// never conflated.
export function isDisciplinaryActionCurrentlyActive(activeUntil: string | null, asOfDate: string): boolean {
  if (activeUntil === null) return true;
  return activeUntil >= asOfDate;
}

async function canManageDiscipline(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// Append-only — never updates an existing disciplinary_actions row.
// active_until is computed here (never accepted as a caller-supplied
// value) so it can never drift from the real approved durations.
export async function issueDisciplinaryAction(params: {
  profileId: string;
  actionType: DisciplinaryActionType;
  reason: string;
  incidentDate?: string | null;
  investigationId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; actionId: string } | { ok: false; error: string }> {
  if (!(await canManageDiscipline(params.actorUserId))) {
    return { ok: false, error: "Not authorized to issue a disciplinary action." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A documented reason is required." };

  const issuedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("disciplinary_actions")
    .insert({
      profile_id: params.profileId,
      action_type: params.actionType,
      reason: params.reason,
      incident_date: params.incidentDate ?? null,
      investigation_id: params.investigationId ?? null,
      issued_by: params.actorUserId,
      issued_at: issuedAt,
      active_until: computeDisciplinaryActionActiveUntil(params.actionType, issuedAt),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to issue the disciplinary action." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "disciplinary_action.issued",
    entityType: "user",
    entityId: params.profileId,
    metadata: { actionId: data.id, actionType: params.actionType },
  });
  return { ok: true, actionId: data.id };
}

export async function listDisciplinaryActionsForProfile(profileId: string): Promise<
  { id: string; actionType: DisciplinaryActionType; reason: string; issuedAt: string; activeUntil: string | null; isCurrentlyActive: boolean }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("disciplinary_actions")
    .select("id, action_type, reason, issued_at, active_until")
    .eq("profile_id", profileId)
    .order("issued_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load disciplinary_actions", error.message);
    return [];
  }
  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).map((r) => ({
    id: r.id,
    actionType: r.action_type as DisciplinaryActionType,
    reason: r.reason,
    issuedAt: r.issued_at,
    activeUntil: r.active_until,
    isCurrentlyActive: isDisciplinaryActionCurrentlyActive(r.active_until, today),
  }));
}

// Investigation — genuinely distinct from discipline: it can close with
// no disciplinary action at all (OS-HR-GH-004 5.2).
export async function openInvestigation(params: { profileId: string; reason: string; actorUserId: string }): Promise<{ ok: true; investigationId: string } | { ok: false; error: string }> {
  if (!(await canManageDiscipline(params.actorUserId))) {
    return { ok: false, error: "Not authorized to open an investigation." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A reason is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("investigations")
    .insert({ profile_id: params.profileId, initiated_by: params.actorUserId, reason: params.reason })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to open the investigation." };

  await logActivity({ actorUserId: params.actorUserId, action: "investigation.opened", entityType: "user", entityId: params.profileId, metadata: { investigationId: data.id } });
  return { ok: true, investigationId: data.id };
}

export type InvestigationOutcome = "closed_no_action" | "closed_resulted_in_discipline" | "closed_resulted_in_separation";

export async function closeInvestigation(params: { investigationId: string; outcome: InvestigationOutcome; outcomeNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageDiscipline(params.actorUserId))) {
    return { ok: false, error: "Not authorized to close an investigation." };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin.from("investigations").select("id, profile_id, status").eq("id", params.investigationId).maybeSingle();
  if (!existing) return { ok: false, error: "Investigation not found." };
  if (existing.status !== "open") return { ok: false, error: `Cannot close an investigation already in status "${existing.status}".` };

  const { error } = await admin
    .from("investigations")
    .update({ status: params.outcome, closed_at: new Date().toISOString(), closed_by: params.actorUserId, outcome_notes: params.outcomeNotes ?? null })
    .eq("id", params.investigationId)
    .eq("status", "open");
  if (error) return { ok: false, error: "Failed to close the investigation." };

  await logActivity({ actorUserId: params.actorUserId, action: "investigation.closed", entityType: "user", entityId: existing.profile_id, metadata: { investigationId: params.investigationId, outcome: params.outcome } });
  return { ok: true };
}

// Suspension default is full basic pay + normal benefits (OS-HR-GH-004
// 5.3) — a caller must EXPLICITLY set either to false; the function
// signature defaults both to true, matching the policy's own default.
export async function recordInvestigatorySuspension(params: {
  investigationId: string;
  profileId: string;
  reason: string;
  fullBasicPay?: boolean;
  normalBenefits?: boolean;
  accessRestricted?: boolean;
  actorUserId: string;
}): Promise<{ ok: true; suspensionId: string } | { ok: false; error: string }> {
  if (!(await canManageDiscipline(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record an investigatory suspension." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A documented reason is required." };

  const suspendedAt = new Date();
  const initialReviewDueAt = new Date(suspendedAt);
  initialReviewDueAt.setUTCDate(initialReviewDueAt.getUTCDate() + 7); // OS-HR-GH-004 5.3's real approved figure

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("investigatory_suspensions")
    .insert({
      investigation_id: params.investigationId,
      profile_id: params.profileId,
      reason: params.reason,
      full_basic_pay: params.fullBasicPay ?? true,
      normal_benefits: params.normalBenefits ?? true,
      access_restricted: params.accessRestricted ?? false,
      decision_maker: params.actorUserId,
      suspended_at: suspendedAt.toISOString(),
      initial_review_due_at: initialReviewDueAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the suspension." };

  await logActivity({ actorUserId: params.actorUserId, action: "investigatory_suspension.recorded", entityType: "user", entityId: params.profileId, metadata: { suspensionId: data.id, investigationId: params.investigationId } });
  return { ok: true, suspensionId: data.id };
}

export async function recordSuspensionReview(params: {
  suspensionId: string;
  decision: "continue_suspension" | "end_suspension";
  notes?: string | null;
  nextReviewDueAt?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageDiscipline(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a suspension review." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("suspension_reviews").insert({
    suspension_id: params.suspensionId,
    reviewed_by: params.actorUserId,
    decision: params.decision,
    notes: params.notes ?? null,
    next_review_due_at: params.nextReviewDueAt ?? null,
  });
  if (error) return { ok: false, error: "Failed to record the suspension review." };

  if (params.decision === "end_suspension") {
    await admin.from("investigatory_suspensions").update({ ended_at: new Date().toISOString(), ended_reason: params.notes ?? null }).eq("id", params.suspensionId).is("ended_at", null);
  }

  await logActivity({ actorUserId: params.actorUserId, action: "investigatory_suspension.reviewed", entityType: "investigatory_suspension", entityId: params.suspensionId, metadata: { decision: params.decision } });
  return { ok: true };
}
