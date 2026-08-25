import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Shared core of Position assignment — the single place that resolves
// Department + Craft (operational_title_id) + Grade + direct manager
// together from a chosen Position and writes them to staff_details, per
// the Ordift Organizational & Administrative Architecture V1, Phase 2
// invariant ("Position drives Grade" — Decision 3), extended in Phase 3
// Part C to also resolve manager_id from the Position's structural
// reports_to_position_id. Used by both the admin's own self-view profile
// edit (src/app/admin/profile/[id]/actions.ts) and the any-staff-member
// assignment surface on /admin/users (src/app/admin/users/actions.ts) —
// Phase 2.1, Part B — so the resolution logic and audit trail can never
// drift between the two entry points. Callers are responsible for their
// own authorization check (both require Super Admin, matching the
// Grade-write precedent) and for revalidatePath/redirect appropriate to
// their own route.
//
// manager_id resolution is a snapshot taken at assignment time, not a
// live-computed value: if the person occupying the reports-to Position
// later changes, everyone who reports to that Position keeps their old
// manager_id until their own Position is next reassigned/re-saved. See
// the Phase 3 report's deferred-items section — building automatic
// cascading re-resolution across the whole org graph was judged out of
// proportion for this phase; re-saving the affected person's Position
// (even to the same value) refreshes it.
export type AssignPositionResult = { ok: true } | { ok: false; error: string };

export async function assignStaffPosition(params: {
  targetUserId: string;
  positionId: string | null;
  actorUserId: string;
}): Promise<AssignPositionResult> {
  const { targetUserId, positionId, actorUserId } = params;
  const admin = createAdminClient();

  const { data: previous } = await admin
    .from("staff_details")
    .select("position_id, grade_id, manager_id")
    .eq("id", targetUserId)
    .maybeSingle();

  let next: {
    department_id: string | null;
    position_id: string | null;
    operational_title_id: string | null;
    grade_id: string | null;
    manager_id: string | null;
  };
  let positionName: string | null = null;

  if (positionId) {
    const { data: position, error: positionError } = await admin
      .from("positions")
      .select("id, name, department_id, operational_title_id, default_grade_id, reports_to_position_id")
      .eq("id", positionId)
      .maybeSingle();
    if (positionError || !position) {
      console.error("[assignStaffPosition] position not found", positionId, positionError?.message);
      return { ok: false, error: "Position not found." };
    }
    positionName = position.name;

    // Direct manager = whoever currently occupies the Position this one
    // structurally reports to, if anyone — null (no manager resolved)
    // when the reporting Position is unoccupied, per "Empty leadership
    // Positions must not break the system."
    let managerId: string | null = null;
    if (position.reports_to_position_id) {
      const { data: managerRow } = await admin
        .from("staff_details")
        .select("id")
        .eq("position_id", position.reports_to_position_id)
        .neq("id", targetUserId)
        .limit(1)
        .maybeSingle();
      managerId = managerRow?.id ?? null;
    }

    next = {
      department_id: position.department_id,
      position_id: position.id,
      operational_title_id: position.operational_title_id,
      grade_id: position.default_grade_id,
      manager_id: managerId,
    };
  } else {
    next = { department_id: null, position_id: null, operational_title_id: null, grade_id: null, manager_id: null };
  }

  const { error } = await admin.from("staff_details").upsert(
    { id: targetUserId, ...next, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[assignStaffPosition] failed to update staff_details", error.message);
    return { ok: false, error: "Failed to update organizational assignment." };
  }

  const previousPositionId = previous?.position_id ?? null;
  if (previousPositionId !== next.position_id) {
    await logActivity({
      actorUserId,
      action: previousPositionId ? "position.changed" : "position.assigned",
      entityType: "user",
      entityId: targetUserId,
      metadata: { previousPositionId, newPositionId: next.position_id, newPositionName: positionName },
    });

    const previousGradeId = previous?.grade_id ?? null;
    if (previousGradeId !== next.grade_id) {
      await logActivity({
        actorUserId,
        action: "grade.auto_resolved",
        entityType: "user",
        entityId: targetUserId,
        metadata: { previousGradeId, newGradeId: next.grade_id, resolvedFromPositionId: next.position_id },
      });
    }

    const previousManagerId = previous?.manager_id ?? null;
    if (previousManagerId !== next.manager_id) {
      await logActivity({
        actorUserId,
        action: "manager.auto_resolved",
        entityType: "user",
        entityId: targetUserId,
        metadata: { previousManagerId, newManagerId: next.manager_id, resolvedFromPositionId: next.position_id },
      });
    }
  }

  return { ok: true };
}
