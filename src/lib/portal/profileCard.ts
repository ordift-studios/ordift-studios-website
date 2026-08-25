import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin, hasRole, type CurrentUser, type RoleSlug, type AccessStatus } from "@/lib/portal/roles";
import { resolveCurrentManager } from "@/lib/organization/reporting";

// Backs the Admin Profile Quick Card (src/app/admin/layout.tsx). V1 is
// self-view only — the logged-in admin viewing their own card — so this
// always queries through the request-scoped, RLS-bound client (same as
// getCurrentUser()), never the service-role admin client, except for the
// one field RLS can't answer at all: last_sign_in_at lives on auth.users,
// which PostgREST never exposes. That one field uses a narrow
// admin.auth.admin.getUserById(user.id) call scoped to the caller's own,
// already-verified id — never another user's.
//
// Grade visibility is enforced twice, deliberately: the "grades: admin
// read" RLS policy (migration 0017) means a non-admin/-super_admin
// viewer's own join to grades comes back empty even though it's their
// own row, and this function also only resolves/returns `grade` when
// canViewGrade is true — so a UI bug that ignored canViewGrade still
// couldn't leak it, since the data was never fetched to begin with. See
// GRADE system policy in ADMIN_GUIDE.md.
export type ProfileCard = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  initials: string;
  avatarUrl: string | null;
  memberNumber: string | null;
  classificationId: string | null;
  classificationName: string | null;
  roles: RoleSlug[];
  roleLabel: string;
  operationalTitleId: string | null;
  jobTitle: string | null;
  department: string | null;
  positionId: string | null;
  positionName: string | null;
  // Ordift Organizational & Administrative Architecture V1, Phase 3
  // (2026-08-25) — callSign resolves from the person's current Position
  // (see supabase/migrations/0042_phase3_callsigns_authority_reporting.sql),
  // never entered directly. managerName resolves from staff_details.manager_id.
  callSign: string | null;
  managerName: string | null;
  canViewGrade: boolean;
  gradeId: string | null;
  grade: { code: string; name: string } | null;
  dateJoined: string;
  tenure: string;
  accountStatus: AccessStatus;
  lastLoginAt: string | null;
};

// Highest-privilege first — matches primaryPortalPath()'s ordering in
// roles.ts, reused here purely for display order, not access control.
// Exported so src/lib/portal/actorIdentity.ts (the audit-trail identity
// resolver) can format a role label the same way, instead of a second
// copy of this list drifting out of sync.
export const ROLE_DISPLAY_ORDER: RoleSlug[] = [
  "super_admin",
  "admin",
  "staff",
  "contractor",
  "vendor",
  "model",
  "workshop_participant",
  "client",
];

export const ROLE_LABELS: Record<RoleSlug, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  contractor: "Contractor / Collaborator",
  vendor: "Vendor / Partner",
  model: "Model",
  workshop_participant: "Workshop Participant",
  client: "Client",
};

function initialsFromName(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (fullName?.trim() && parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function calculateTenure(createdAt: string): string {
  const start = new Date(createdAt);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "Less than a month";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (remMonths > 0) parts.push(`${remMonths} month${remMonths === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export async function getProfileCard(user: CurrentUser): Promise<ProfileCard> {
  const supabase = await createClient();
  const canViewGrade = hasRole(user, "admin") || isSuperAdmin(user);

  const [{ data: profile }, { data: userRoles }, { data: staffDetails }, { data: activeMemberNumber }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, phone, avatar_url, member_number, access_status, created_at")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("user_roles").select("roles(slug, name)").eq("user_id", user.id),
      supabase
        .from("staff_details")
        .select(
          "department, operational_title_id, operational_titles(name), grade_id, grades(grade_code, name), position_id, positions(name, call_sign, departments(name))"
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("member_numbers")
        .select("classification_id, member_number_classifications(name)")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
    ]);

  const roles = (userRoles ?? [])
    .map((r) => (r.roles as unknown as { slug: RoleSlug } | null)?.slug)
    .filter((slug): slug is RoleSlug => Boolean(slug));

  const roleLabel =
    ROLE_DISPLAY_ORDER.filter((slug) => roles.includes(slug))
      .map((slug) => ROLE_LABELS[slug])
      .join(", ") || "No role assigned";

  // canViewGrade already gates the RLS read (see file header) — this is
  // the second, defense-in-depth layer: even if `grades` came back
  // populated, only return it to the caller when canViewGrade is true.
  const gradeRow = staffDetails?.grades as unknown as { grade_code: string; name: string } | null;
  const grade = canViewGrade && gradeRow ? { code: gradeRow.grade_code, name: gradeRow.name } : null;
  const gradeId = canViewGrade ? (staffDetails?.grade_id ?? null) : null;

  const titleRow = staffDetails?.operational_titles as unknown as { name: string } | null;
  const classificationRow = activeMemberNumber?.member_number_classifications as unknown as { name: string } | null;

  // Position is the authoritative organizational assignment (Phase 2,
  // 2026-08-25) — when set, it resolves both the displayed Position name
  // and Department (via positions.departments), taking precedence over
  // the legacy free-text staff_details.department, which is kept only as
  // a fallback for any account not yet migrated into the new catalogue.
  const positionRow = staffDetails?.positions as unknown as {
    name: string;
    call_sign: string | null;
    departments: { name: string } | null;
  } | null;
  const resolvedDepartment = positionRow?.departments?.name ?? staffDetails?.department ?? null;

  // Direct manager — LIVE resolution through the Position reporting
  // chain (Phase 3.1, Part 6), not a read of the cached
  // staff_details.manager_id snapshot — see src/lib/organization/reporting.ts
  // for why. Correct even if the occupant of the reporting Position has
  // changed or left since this person's own Position was last assigned.
  const managerName = (await resolveCurrentManager(staffDetails?.position_id ?? null))?.fullName ?? null;

  let lastLoginAt: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(user.id);
    lastLoginAt = data.user?.last_sign_in_at ?? null;
  } catch {
    lastLoginAt = null;
  }

  const createdAt = profile?.created_at ?? new Date().toISOString();

  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    initials: initialsFromName(profile?.full_name ?? null, user.email),
    avatarUrl: profile?.avatar_url ?? null,
    memberNumber: profile?.member_number ?? null,
    classificationId: activeMemberNumber?.classification_id ?? null,
    classificationName: classificationRow?.name ?? null,
    roles,
    roleLabel,
    operationalTitleId: staffDetails?.operational_title_id ?? null,
    jobTitle: titleRow?.name ?? null,
    department: resolvedDepartment,
    positionId: staffDetails?.position_id ?? null,
    positionName: positionRow?.name ?? null,
    callSign: positionRow?.call_sign ?? null,
    managerName,
    canViewGrade,
    gradeId,
    grade,
    dateJoined: createdAt,
    tenure: calculateTenure(createdAt),
    accountStatus: (profile?.access_status as AccessStatus | undefined) ?? "active",
    lastLoginAt,
  };
}
