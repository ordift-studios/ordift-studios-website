import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 4 (2026-09-14) —
// grievance / speak-up / appeals. Deliberately kept as separate
// workflows (OS-HR-GH-004 6.1/6.2/6.3) — no shared "case" abstraction
// invented across them.

export async function canManageGrievances(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export interface GrievanceListRow {
  id: string;
  raisedBy: string;
  againstProfileId: string | null;
  grievanceType: "informal" | "formal";
  description: string;
  bypassedManager: boolean;
  status: string;
  submittedAt: string;
  acknowledgementDueAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

// Cross-staff admin queue — matches the *AcrossStaff() convention
// already established for Leave/Attendance. Returns raw profile ids
// rather than embedding names via a PostgREST join, so the page can
// resolve display names from the roster it already loads (avoiding an
// unverified embed on a table with two separate profile references).
export async function listGrievancesAcrossStaff(): Promise<GrievanceListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grievances")
    .select("id, raised_by, against_profile_id, grievance_type, description, bypassed_manager, status, submitted_at, acknowledgement_due_at, acknowledged_at, resolved_at, resolution_notes")
    .order("submitted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load grievances", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    raisedBy: r.raised_by,
    againstProfileId: r.against_profile_id,
    grievanceType: r.grievance_type,
    description: r.description,
    bypassedManager: r.bypassed_manager,
    status: r.status,
    submittedAt: r.submitted_at,
    acknowledgementDueAt: r.acknowledgement_due_at,
    acknowledgedAt: r.acknowledged_at,
    resolvedAt: r.resolved_at,
    resolutionNotes: r.resolution_notes,
  }));
}

export interface SpeakUpReportListRow {
  id: string;
  reportedBy: string | null;
  description: string;
  status: string;
  submittedAt: string;
  handledBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

// Confidential channel — the caller (the page) is responsible for
// restricting who ever sees this list; this function itself performs
// no authorization narrowing, matching the read-only *ForProfile/
// *AcrossStaff convention elsewhere (the write path, resolveSpeakUpReport,
// carries the real enforcement).
export async function listSpeakUpReportsAcrossStaff(): Promise<SpeakUpReportListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("speak_up_reports")
    .select("id, reported_by, description, status, submitted_at, handled_by, resolved_at, resolution_notes")
    .order("submitted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load speak_up_reports", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    reportedBy: r.reported_by,
    description: r.description,
    status: r.status,
    submittedAt: r.submitted_at,
    handledBy: r.handled_by,
    resolvedAt: r.resolved_at,
    resolutionNotes: r.resolution_notes,
  }));
}

// acknowledgement_due_at is computed here, never caller-supplied, so it
// can never drift from OS-HR-GH-004 6.1's real 2-working-day target.
// "Working day" is not modeled here (no working-calendar table exists
// in this codebase yet) — this uses calendar days, a deliberately
// conservative target, never invented as a working-day calculation.
export interface OwnGrievanceView {
  id: string;
  grievanceType: "informal" | "formal";
  description: string;
  status: string;
  submittedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

// Self-service — mirrors the table's own "read own submission or
// admin" RLS policy (migration 0089), scoped server-side since this
// codebase's reads always go through the service-role admin client
// (which bypasses RLS) rather than relying on it as the enforcement.
export async function listGrievancesForProfile(profileId: string): Promise<OwnGrievanceView[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grievances")
    .select("id, grievance_type, description, status, submitted_at, acknowledged_at, resolved_at, resolution_notes")
    .eq("raised_by", profileId)
    .order("submitted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load own grievances", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    grievanceType: r.grievance_type,
    description: r.description,
    status: r.status,
    submittedAt: r.submitted_at,
    acknowledgedAt: r.acknowledged_at,
    resolvedAt: r.resolved_at,
    resolutionNotes: r.resolution_notes,
  }));
}

export async function submitGrievance(params: {
  raisedBy: string;
  grievanceType: "informal" | "formal";
  description: string;
  againstProfileId?: string | null;
  bypassedManager?: boolean;
}): Promise<{ ok: true; grievanceId: string } | { ok: false; error: string }> {
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const submittedAt = new Date();
  const acknowledgementDueAt = new Date(submittedAt);
  acknowledgementDueAt.setUTCDate(acknowledgementDueAt.getUTCDate() + 2);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grievances")
    .insert({
      raised_by: params.raisedBy,
      against_profile_id: params.againstProfileId ?? null,
      grievance_type: params.grievanceType,
      description: params.description,
      bypassed_manager: params.bypassedManager ?? false,
      submitted_at: submittedAt.toISOString(),
      acknowledgement_due_at: acknowledgementDueAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the grievance." };

  await logActivity({ actorUserId: params.raisedBy, action: "grievance.submitted", entityType: "grievance", entityId: data.id, metadata: { grievanceType: params.grievanceType } });
  return { ok: true, grievanceId: data.id };
}

export async function acknowledgeGrievance(params: { grievanceId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageGrievances(params.actorUserId))) {
    return { ok: false, error: "Not authorized to acknowledge a grievance." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grievances")
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), acknowledged_by: params.actorUserId })
    .eq("id", params.grievanceId)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to acknowledge the grievance." };
  if (!data) return { ok: false, error: "Grievance not found, or already acknowledged." };

  await logActivity({ actorUserId: params.actorUserId, action: "grievance.acknowledged", entityType: "grievance", entityId: params.grievanceId });
  return { ok: true };
}

export type GrievanceResolutionStatus = "resolved" | "escalated";

export async function resolveGrievance(params: { grievanceId: string; status: GrievanceResolutionStatus; resolutionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageGrievances(params.actorUserId))) {
    return { ok: false, error: "Not authorized to resolve a grievance." };
  }
  if (!params.resolutionNotes.trim()) return { ok: false, error: "Resolution notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grievances")
    .update({ status: params.status, resolved_at: new Date().toISOString(), resolution_notes: params.resolutionNotes })
    .eq("id", params.grievanceId)
    .in("status", ["submitted", "acknowledged", "under_review"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to resolve the grievance." };
  if (!data) return { ok: false, error: "Grievance not found, or already resolved." };

  await logActivity({ actorUserId: params.actorUserId, action: "grievance.resolved", entityType: "grievance", entityId: params.grievanceId, metadata: { status: params.status } });
  return { ok: true };
}

// Speak-Up — a dedicated whistleblowing channel (OS-HR-GH-004 6.3),
// deliberately separate from grievances. reportedBy is optional to
// support anonymous submission.
export async function submitSpeakUpReport(params: { reportedBy?: string | null; description: string }): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("speak_up_reports")
    .insert({ reported_by: params.reportedBy ?? null, description: params.description })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the report." };

  if (params.reportedBy) {
    await logActivity({ actorUserId: params.reportedBy, action: "speak_up_report.submitted", entityType: "speak_up_report", entityId: data.id });
  }
  return { ok: true, reportId: data.id };
}

export async function resolveSpeakUpReport(params: { reportId: string; resolutionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageGrievances(params.actorUserId))) {
    return { ok: false, error: "Not authorized to resolve a Speak-Up report." };
  }
  if (!params.resolutionNotes.trim()) return { ok: false, error: "Resolution notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("speak_up_reports")
    .update({ status: "resolved", handled_by: params.actorUserId, resolved_at: new Date().toISOString(), resolution_notes: params.resolutionNotes })
    .eq("id", params.reportId)
    .in("status", ["submitted", "under_review"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to resolve the report." };
  if (!data) return { ok: false, error: "Report not found, or already resolved." };

  await logActivity({ actorUserId: params.actorUserId, action: "speak_up_report.resolved", entityType: "speak_up_report", entityId: params.reportId });
  return { ok: true };
}
