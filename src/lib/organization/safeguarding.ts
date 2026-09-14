import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 12 (2026-09-14),
// updated Phase B5 Step 1 (2026-09-14) — safeguarding children and
// vulnerable persons, OS-HR-GH-005 section 6. No numeric formula
// exists in this section, so this module carries no pure/computed
// functions — matching this codebase's established convention for
// sections with nothing to compute.
//
// Safeguarding CHECKS (6.3) are no longer covered by this file — the
// schema reconciliation (migration 0104) retired the safeguarding_checks
// table in favor of extending the pre-existing, already-UI-connected
// background_screenings table (migration 0065) with a
// safeguarding_clearance category; see
// src/lib/organization/backgroundScreening.ts for that logic now. This
// file retains only restricted CONCERN reporting (6.4), which has no
// pre-existing counterpart anywhere in this codebase.

async function canManageSafeguarding(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
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
