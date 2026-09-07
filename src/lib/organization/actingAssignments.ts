import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios — Organizational Structure, Authority Grants, Staff
// Onboarding & Work Email V1 (2026-09-07), Part F — Acting Assignments.
// Never writes staff_details.grade_id/position_id — a person's
// substantive (permanent) Position/Grade is completely untouched by
// this module, by construction (no function here has a write path to
// either column). Any real temporary CAPABILITY/Financial Authority
// Level that should come with the assignment is granted the normal way
// (a time-bound authority_grants row, expires_at = end_date) and only
// cross-referenced here via linkedAuthorityGrantId — one expiring
// mechanism, not two.

export type ActingAssignment = {
  id: string;
  profileId: string;
  actingTitle: string;
  actingPositionId: string | null;
  scopeDepartmentId: string | null;
  financialAuthorityLevel: number | null;
  linkedAuthorityGrantId: string | null;
  startDate: string;
  endDate: string;
  approvedBy: string;
  reason: string;
  endedEarlyAt: string | null;
  endedEarlyBy: string | null;
  createdAt: string;
};

const SELECT =
  "id, profile_id, acting_title, acting_position_id, scope_department_id, financial_authority_level, linked_authority_grant_id, start_date, end_date, approved_by, reason, ended_early_at, ended_early_by, created_at";

function mapRow(r: {
  id: string;
  profile_id: string;
  acting_title: string;
  acting_position_id: string | null;
  scope_department_id: string | null;
  financial_authority_level: number | null;
  linked_authority_grant_id: string | null;
  start_date: string;
  end_date: string;
  approved_by: string;
  reason: string;
  ended_early_at: string | null;
  ended_early_by: string | null;
  created_at: string;
}): ActingAssignment {
  return {
    id: r.id,
    profileId: r.profile_id,
    actingTitle: r.acting_title,
    actingPositionId: r.acting_position_id,
    scopeDepartmentId: r.scope_department_id,
    financialAuthorityLevel: r.financial_authority_level,
    linkedAuthorityGrantId: r.linked_authority_grant_id,
    startDate: r.start_date,
    endDate: r.end_date,
    approvedBy: r.approved_by,
    reason: r.reason,
    endedEarlyAt: r.ended_early_at,
    endedEarlyBy: r.ended_early_by,
    createdAt: r.created_at,
  };
}

// Pure — an acting assignment is currently in effect: not ended early,
// and today falls within [startDate, endDate]. All temporary authority
// expires by construction — this is never manually "remembered", it's
// recomputed from today's date every time.
export function isActingAssignmentActive(
  assignment: Pick<ActingAssignment, "startDate" | "endDate" | "endedEarlyAt">,
  today: Date = new Date()
): boolean {
  if (assignment.endedEarlyAt) return false;
  const t = today.toISOString().slice(0, 10);
  return t >= assignment.startDate && t <= assignment.endDate;
}

// Same tier as staff onboarding/Position assignment — PULSE (People)
// administering an acting assignment, PRIME (Operations) administering
// routine staff assignment, or Super Admin.
async function canManageActingAssignments(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  if (await hasJurisdictionAuthority(actorUserId, "people", "administer")) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export async function listActingAssignments(): Promise<ActingAssignment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("acting_assignments").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load acting_assignments", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function createActingAssignment(params: {
  profileId: string;
  actingTitle: string;
  actingPositionId?: string | null;
  scopeDepartmentId?: string | null;
  financialAuthorityLevel?: number | null;
  linkedAuthorityGrantId?: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  approvedBy: string;
}): Promise<{ ok: true; assignmentId: string } | { ok: false; error: string }> {
  if (!(await canManageActingAssignments(params.approvedBy))) {
    return { ok: false, error: "Not authorized to create an acting assignment." };
  }
  if (params.endDate < params.startDate) {
    return { ok: false, error: "End date must not be before the start date." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acting_assignments")
    .insert({
      profile_id: params.profileId,
      acting_title: params.actingTitle,
      acting_position_id: params.actingPositionId ?? null,
      scope_department_id: params.scopeDepartmentId ?? null,
      financial_authority_level: params.financialAuthorityLevel ?? null,
      linked_authority_grant_id: params.linkedAuthorityGrantId ?? null,
      start_date: params.startDate,
      end_date: params.endDate,
      approved_by: params.approvedBy,
      reason: params.reason,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to create acting_assignment", error?.message);
    return { ok: false, error: "Failed to create the acting assignment." };
  }

  await logActivity({
    actorUserId: params.approvedBy,
    action: "acting_assignment.created",
    entityType: "user",
    entityId: params.profileId,
    metadata: { actingTitle: params.actingTitle, startDate: params.startDate, endDate: params.endDate, reason: params.reason },
  });

  return { ok: true, assignmentId: data.id };
}

export async function endActingAssignmentEarly(params: {
  assignmentId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageActingAssignments(params.actorUserId))) {
    return { ok: false, error: "Not authorized to end an acting assignment." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acting_assignments")
    .select("profile_id, ended_early_at")
    .eq("id", params.assignmentId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Acting assignment not found." };
  if (existing.ended_early_at) return { ok: false, error: "This acting assignment has already been ended." };

  const { error } = await admin
    .from("acting_assignments")
    .update({ ended_early_at: new Date().toISOString(), ended_early_by: params.actorUserId })
    .eq("id", params.assignmentId)
    .is("ended_early_at", null);
  if (error) {
    console.error("[organization] failed to end acting_assignment early", error.message);
    return { ok: false, error: "Failed to end the acting assignment." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "acting_assignment.ended_early",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { assignmentId: params.assignmentId },
  });

  return { ok: true };
}
