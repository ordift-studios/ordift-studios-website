"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Organizational & Administrative Architecture V1, Phase 1
// (2026-08-25). Gated to Admin or Super Admin, matching the RLS policies
// on departments/positions exactly (private.is_admin_or_super_admin()) —
// narrower than plain staff, broader than the Super-Admin-only
// /admin/lookups precedent, per explicit direction for this feature.
//
// These actions only ever touch departments/positions. They never write
// to staff_details, user_roles, or grade_id on any account — assigning a
// person to a Department/Position is a later, separately authorized
// phase.

async function requireOrgAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Only an Admin or Super Admin can manage Departments/Positions.");
  }
  return user;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function addDepartmentAction(formData: FormData): Promise<void> {
  const currentUser = await requireOrgAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("departments")
    .insert({ slug: slugify(name), name, description: description || null, sort_order: 500 })
    .select("id")
    .single();

  if (error) {
    console.error("[organization] failed to add department", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "department.created",
      entityType: "department",
      entityId: data?.id,
      metadata: { name },
    });
  }

  revalidatePath("/admin/organization");
}

export async function toggleDepartmentAction(formData: FormData): Promise<void> {
  const currentUser = await requireOrgAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const admin = createAdminClient();
  const { error } = await admin.from("departments").update({ active: !active }).eq("id", id);
  if (error) {
    console.error("[organization] failed to toggle department", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "department.toggled",
      entityType: "department",
      entityId: id,
      metadata: { active: !active },
    });
  }

  revalidatePath("/admin/organization");
}

export async function addPositionAction(formData: FormData): Promise<void> {
  const currentUser = await requireOrgAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const operationalTitleId = String(formData.get("operationalTitleId") ?? "").trim() || null;
  const defaultGradeId = String(formData.get("defaultGradeId") ?? "").trim();
  const defaultRoleSlug = String(formData.get("defaultRoleSlug") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !departmentId || !defaultGradeId) return;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("positions")
    .insert({
      slug: slugify(name),
      name,
      department_id: departmentId,
      operational_title_id: operationalTitleId,
      default_grade_id: defaultGradeId,
      default_role_slug: defaultRoleSlug,
      description: description || null,
      sort_order: 500,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[organization] failed to add position", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "position.created",
      entityType: "position",
      entityId: data?.id,
      metadata: { name, departmentId, defaultGradeId, defaultRoleSlug },
    });
  }

  revalidatePath("/admin/organization");
}

export async function togglePositionAction(formData: FormData): Promise<void> {
  const currentUser = await requireOrgAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const admin = createAdminClient();
  const { error } = await admin.from("positions").update({ active: !active }).eq("id", id);
  if (error) {
    console.error("[organization] failed to toggle position", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "position.toggled",
      entityType: "position",
      entityId: id,
      metadata: { active: !active },
    });
  }

  revalidatePath("/admin/organization");
}
