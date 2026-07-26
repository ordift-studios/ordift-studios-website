import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Project-based collaborator access (migration 0009). Uses the
// service-role client throughout — an admin assigning/searching
// projects needs to see across every client's enquiries/workshop
// registrations, not just their own, the same reason
// src/lib/portal/adminData.ts already uses the admin client.

export type ProjectEntityType = "enquiry" | "workshop_registration";

export const ASSIGNMENT_STATUSES = ["invited", "active", "completed", "removed", "withdrawn"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  invited: "Invited",
  active: "Active",
  completed: "Completed",
  removed: "Removed",
  withdrawn: "Withdrawn",
};

export type ProjectSearchResult = {
  entityType: ProjectEntityType;
  entityId: string;
  label: string;
};

// Powers the "assign to project" picker — searches both project kinds
// by reference/name/email, capped small since this is a live-typing
// search, not a report.
export async function searchProjects(query: string): Promise<ProjectSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const admin = createAdminClient();
  const like = `%${trimmed}%`;

  const [{ data: enquiries }, { data: registrations }] = await Promise.all([
    admin
      .from("enquiries")
      .select("id, reference_number, full_name, service")
      .or(`reference_number.ilike.${like},full_name.ilike.${like}`)
      .limit(10),
    admin
      .from("workshop_registrations")
      .select("id, registration_reference, full_name, workshop_title")
      .or(`registration_reference.ilike.${like},full_name.ilike.${like}`)
      .limit(10),
  ]);

  const results: ProjectSearchResult[] = [];
  for (const e of enquiries ?? []) {
    results.push({
      entityType: "enquiry",
      entityId: e.id,
      label: `${e.reference_number} — ${e.full_name} (${e.service})`,
    });
  }
  for (const r of registrations ?? []) {
    results.push({
      entityType: "workshop_registration",
      entityId: r.id,
      label: `${r.registration_reference} — ${r.full_name} (${r.workshop_title})`,
    });
  }
  return results;
}

async function resolveEntityLabel(entityType: ProjectEntityType, entityId: string): Promise<string> {
  const admin = createAdminClient();
  if (entityType === "enquiry") {
    const { data } = await admin
      .from("enquiries")
      .select("reference_number, full_name, service")
      .eq("id", entityId)
      .maybeSingle();
    return data ? `${data.reference_number} — ${data.full_name} (${data.service})` : "Unknown project";
  }
  const { data } = await admin
    .from("workshop_registrations")
    .select("registration_reference, full_name, workshop_title")
    .eq("id", entityId)
    .maybeSingle();
  return data ? `${data.registration_reference} — ${data.full_name} (${data.workshop_title})` : "Unknown project";
}

export type AdminProjectAssignment = {
  id: string;
  entityType: ProjectEntityType;
  entityId: string;
  entityLabel: string;
  status: AssignmentStatus;
  roleNote: string | null;
  startsAt: string | null;
  endsAt: string | null;
  accessExpiresAt: string | null;
  assignedAt: string;
};

export async function getAssignmentsForUser(userId: string): Promise<AdminProjectAssignment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("project_assignments")
    .select("id, entity_type, entity_id, status, role_note, starts_at, ends_at, access_expires_at, assigned_at")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("[admin] failed to load project_assignments", error.message);
    return [];
  }

  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      entityType: row.entity_type as ProjectEntityType,
      entityId: row.entity_id,
      entityLabel: await resolveEntityLabel(row.entity_type as ProjectEntityType, row.entity_id),
      status: row.status as AssignmentStatus,
      roleNote: row.role_note,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      accessExpiresAt: row.access_expires_at,
      assignedAt: row.assigned_at,
    }))
  );
}

export async function assignUserToProject(params: {
  userId: string;
  entityType: ProjectEntityType;
  entityId: string;
  assignedBy: string;
  roleNote?: string | null;
  accessExpiresAt?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("project_assignments").upsert(
    {
      user_id: params.userId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      status: "active",
      role_note: params.roleNote ?? null,
      access_expires_at: params.accessExpiresAt ?? null,
      assigned_by: params.assignedBy,
      assigned_at: new Date().toISOString(),
      removed_at: null,
      removed_by: null,
      removal_reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entity_type,entity_id" }
  );

  if (error) {
    console.error("[admin] failed to assign project", error.message);
    return { ok: false, error: error.message };
  }

  await logActivity({
    actorUserId: params.assignedBy,
    action: "project_assignment.assigned",
    entityType: "user",
    entityId: params.userId,
    metadata: { projectEntityType: params.entityType, projectEntityId: params.entityId },
  });

  return { ok: true };
}

export async function updateAssignmentStatus(params: {
  assignmentId: string;
  status: AssignmentStatus;
  actorUserId: string;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("project_assignments")
    .select("user_id, entity_type, entity_id")
    .eq("id", params.assignmentId)
    .maybeSingle();

  const isRemoval = params.status === "removed" || params.status === "withdrawn";
  const { error } = await admin
    .from("project_assignments")
    .update({
      status: params.status,
      updated_at: new Date().toISOString(),
      ...(isRemoval
        ? { removed_at: new Date().toISOString(), removed_by: params.actorUserId, removal_reason: params.reason ?? null }
        : {}),
    })
    .eq("id", params.assignmentId);

  if (error) {
    console.error("[admin] failed to update project_assignment status", error.message);
    return { ok: false, error: error.message };
  }

  if (existing) {
    await logActivity({
      actorUserId: params.actorUserId,
      action: "project_assignment.status_change",
      entityType: "user",
      entityId: existing.user_id,
      metadata: {
        projectEntityType: existing.entity_type,
        projectEntityId: existing.entity_id,
        status: params.status,
        reason: params.reason ?? null,
      },
    });
  }

  return { ok: true };
}
