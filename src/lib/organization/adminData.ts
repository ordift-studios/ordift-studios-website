import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Department,
  Position,
  DepartmentOption,
  OperationalTitleOption,
  GradeOption,
  RoleOption,
} from "./types";

// Admin-only read layer for Departments/Positions (Phase 1, 2026-08-25).
// Uses the service-role client, same precedent as /admin/lookups —
// read/write is gated at the Server Action/page layer (admin or super
// admin), matching the RLS policies on both tables exactly
// (private.is_admin_or_super_admin()).

export async function listDepartments(): Promise<Department[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("departments")
    .select("id, name, slug, description, head_profile_id, active, sort_order")
    .order("sort_order");
  if (error) {
    console.error("[organization] failed to load departments", error.message);
    return [];
  }
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    description: d.description,
    headProfileId: d.head_profile_id,
    active: d.active,
    sortOrder: d.sort_order,
  }));
}

export async function listPositions(): Promise<Position[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("positions")
    .select(
      "id, name, slug, description, active, sort_order, default_role_slug, department:departments(name), operational_title:operational_titles(name), grade:grades(grade_code, name), department_id, operational_title_id, default_grade_id, call_sign, reports_to_position_id, reports_to:reports_to_position_id(name)"
    )
    .order("sort_order");
  if (error) {
    console.error("[organization] failed to load positions", error.message);
    return [];
  }
  return (data ?? []).map((p) => {
    const department = p.department as unknown as { name: string } | null;
    const operationalTitle = p.operational_title as unknown as { name: string } | null;
    const grade = p.grade as unknown as { grade_code: string; name: string } | null;
    const reportsTo = p.reports_to as unknown as { name: string } | null;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      departmentId: p.department_id,
      departmentName: department?.name ?? "—",
      operationalTitleId: p.operational_title_id,
      operationalTitleName: operationalTitle?.name ?? null,
      defaultGradeId: p.default_grade_id,
      defaultGradeName: grade ? `${grade.grade_code} — ${grade.name}` : "—",
      defaultRoleSlug: p.default_role_slug,
      callSign: p.call_sign,
      reportsToPositionId: p.reports_to_position_id,
      reportsToPositionName: reportsTo?.name ?? null,
      active: p.active,
      sortOrder: p.sort_order,
    };
  });
}

export async function listDepartmentOptions(): Promise<DepartmentOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("departments").select("id, name").eq("active", true).order("sort_order");
  if (error) return [];
  return data ?? [];
}

export async function listOperationalTitleOptions(): Promise<OperationalTitleOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("operational_titles").select("id, name").eq("active", true).order("sort_order");
  if (error) return [];
  return data ?? [];
}

export async function listGradeOptions(): Promise<GradeOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grades")
    .select("id, grade_code, name")
    .eq("active", true)
    .order("rank_order");
  if (error) return [];
  return (data ?? []).map((g) => ({ id: g.id, code: g.grade_code, name: g.name }));
}

export async function listRoleOptions(): Promise<RoleOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("roles").select("slug, name").order("name");
  if (error) return [];
  return data ?? [];
}
