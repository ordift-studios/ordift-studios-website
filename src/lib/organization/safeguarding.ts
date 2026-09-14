import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 12 (2026-09-14) —
// safeguarding children and vulnerable persons, OS-HR-GH-005 section 6.
// No numeric formula exists in this section, so this module carries no
// pure/computed functions — matching this codebase's established
// convention for sections with nothing to compute.

async function canManageSafeguarding(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// requirementEvaluationId optionally links back to the specific
// requirement_evaluations row (already existing, migration 0083) whose
// classifyRequirement() outcome required this check for this role/
// jurisdiction — OS-HR-GH-005 6.3's "through the requirement-
// classification system." This function never re-decides whether a
// check is required; it only records that one was actually completed.
export async function recordSafeguardingCheck(params: {
  profileId: string;
  checkType: string;
  result: string;
  completedAt?: string | null;
  expiryDate?: string | null;
  verificationReference?: string | null;
  requirementEvaluationId?: string | null;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; checkId: string } | { ok: false; error: string }> {
  if (!(await canManageSafeguarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a safeguarding check." };
  }
  if (!params.checkType.trim()) return { ok: false, error: "A check type is required." };
  if (!params.result.trim()) return { ok: false, error: "A result is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("safeguarding_checks")
    .insert({
      profile_id: params.profileId,
      check_type: params.checkType,
      result: params.result,
      completed_at: params.completedAt ?? null,
      expiry_date: params.expiryDate ?? null,
      verification_reference: params.verificationReference ?? null,
      requirement_evaluation_id: params.requirementEvaluationId ?? null,
      notes: params.notes ?? null,
      verified_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the safeguarding check." };

  await logActivity({ actorUserId: params.actorUserId, action: "safeguarding_check.recorded", entityType: "user", entityId: params.profileId, metadata: { checkId: data.id, checkType: params.checkType } });
  return { ok: true, checkId: data.id };
}

export async function listSafeguardingChecksForProfile(profileId: string): Promise<{ id: string; checkType: string; result: string; expiryDate: string | null }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("safeguarding_checks").select("id, check_type, result, expiry_date").eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load safeguarding_checks", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, checkType: r.check_type, result: r.result, expiryDate: r.expiry_date }));
}

// Deliberately NO authorization check — OS-HR-GH-005 6.4's "restricted
// reporting" governs who may later READ a filed concern (admin-only,
// see migration 0097's RLS policy), never who may report one. Matches
// the same prompt-reporting precedent as reportSecurityIncident()
// (infosecControls.ts) and speak_up_reports. The reporter is always the
// authenticated actor themselves — unlike speak_up_reports, a
// safeguarding concern is never filed anonymously, since immediate-
// safety follow-up needs an identified reporter (6.4).
export async function reportSafeguardingConcern(params: {
  concerningProfileId?: string | null;
  description: string;
  immediateSafetyActionTaken?: string | null;
  mandatoryReportingObligationNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  if (!params.description.trim()) return { ok: false, error: "A description of the concern is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("safeguarding_concern_reports")
    .insert({
      reported_by: params.actorUserId,
      concerning_profile_id: params.concerningProfileId ?? null,
      description: params.description,
      immediate_safety_action_taken: params.immediateSafetyActionTaken ?? null,
      mandatory_reporting_obligation_notes: params.mandatoryReportingObligationNotes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to report the safeguarding concern." };

  await logActivity({ actorUserId: params.actorUserId, action: "safeguarding_concern.reported", entityType: "safeguarding_concern_report", entityId: data.id });
  return { ok: true, reportId: data.id };
}

export async function escalateSafeguardingConcern(params: { reportId: string; escalationNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSafeguarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to escalate a safeguarding concern." };
  }
  if (!params.escalationNotes.trim()) return { ok: false, error: "Escalation notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("safeguarding_concern_reports")
    .update({ status: "escalated", handled_by: params.actorUserId, resolution_notes: params.escalationNotes })
    .eq("id", params.reportId)
    .eq("status", "reported")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to escalate the concern." };
  if (!data) return { ok: false, error: "Report not found, or not currently at 'reported' status." };

  await logActivity({ actorUserId: params.actorUserId, action: "safeguarding_concern.escalated", entityType: "safeguarding_concern_report", entityId: params.reportId });
  return { ok: true };
}

export async function resolveSafeguardingConcern(params: { reportId: string; resolutionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSafeguarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to resolve a safeguarding concern." };
  }
  if (!params.resolutionNotes.trim()) return { ok: false, error: "Resolution notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("safeguarding_concern_reports")
    .update({ status: "resolved", handled_by: params.actorUserId, resolved_at: new Date().toISOString(), resolution_notes: params.resolutionNotes })
    .eq("id", params.reportId)
    .in("status", ["reported", "escalated"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to resolve the concern." };
  if (!data) return { ok: false, error: "Report not found, or already resolved." };

  await logActivity({ actorUserId: params.actorUserId, action: "safeguarding_concern.resolved", entityType: "safeguarding_concern_report", entityId: params.reportId });
  return { ok: true };
}

// Admin-only listing — matches the table's own admin-only RLS; there is
// no "for profile" self-service variant since 6.4's restricted-access
// requirement applies regardless of who the concern is about.
export async function listSafeguardingConcernReports(actorUserId: string): Promise<{ id: string; status: string; reportedAt: string }[]> {
  if (!(await canManageSafeguarding(actorUserId))) {
    return [];
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("safeguarding_concern_reports").select("id, status, created_at").order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load safeguarding_concern_reports", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, status: r.status, reportedAt: r.created_at }));
}
