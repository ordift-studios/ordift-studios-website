import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessStatus, RoleSlug } from "@/lib/portal/roles";

export type AdminUserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: RoleSlug[];
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  accessStatus: AccessStatus;
  accessStatusReason: string | null;
  accessStatusChangedAt: string | null;
  accessExpiresAt: string | null;
  operationalTitleId: string | null;
  operationalTitleName: string | null;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
  memberNumber: string | null;
  classificationId: string | null;
  classificationName: string | null;
};

export type AdminUserListResult =
  | { ok: true; users: AdminUserRow[] }
  | { ok: false; error: string };

const LIST_USERS_PAGE_SIZE = 200;
const LIST_USERS_MAX_RETRIES = 3;

// Reconciliation (2026-07-24): the Admin portal was seen showing only 1
// user against a Dashboard "Total: 10 users (estimated)" figure. Direct,
// repeated calls to listUsers() against this project all agreed on
// total: 1 — the Dashboard's "(estimated)" count was simply stale/wrong,
// not this code. Confirmed via a disposable reconciliation script: 0
// auth.users without a profiles row, 0 orphaned profiles.
//
// What IS real: Supabase's Admin API on this project intermittently
// fails with `invalid JWT: unable to parse or verify signature ...
// unrecognized JWT kid <nil> for algorithm ES256` — observed on roughly
// a third of repeated, identical listUsers() calls during that
// investigation, with no pattern tied to params. Looks infra-side (this
// project's new-format Secret Key against this GoTrue/SDK combination),
// not something fixable from application code. Retrying a few times
// before surfacing an error is the practical mitigation — silently
// returning an empty list on a transient failure would be worse, since
// it's indistinguishable from "no users exist."
async function listUsersPage(admin: ReturnType<typeof createAdminClient>, page: number) {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= LIST_USERS_MAX_RETRIES; attempt++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE_SIZE });
    if (!error) return { data, error: null };
    lastError = error.message;
  }
  return { data: null, error: lastError };
}

// Admin-only view — uses the service-role client because listing every
// account's email requires the Auth Admin API (auth.users isn't exposed
// via PostgREST). Page-level authorization (hasRole(user, "admin")) is
// mandatory before calling this, since unlike the Client/Workshop
// Participant/Staff views, this doesn't rely on RLS to scope the
// result. Walks every page rather than trusting a single perPage cap —
// correct at any future scale, not just today's handful of accounts.
export async function listUsersWithRoles(): Promise<AdminUserListResult> {
  const admin = createAdminClient();

  const allAuthUsers: {
    id: string;
    email: string | null;
    created_at: string;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
  }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await listUsersPage(admin, page);
    if (error || !data) {
      console.error("[portal admin] listUsers failed after retries", error);
      return { ok: false, error: error ?? "Failed to load accounts." };
    }
    allAuthUsers.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }))
    );
    if (!data.nextPage) break;
    page = data.nextPage;
  }

  const [
    { data: profiles, error: profilesError },
    { data: userRoles, error: userRolesError },
    { data: roles, error: rolesError },
    { data: staffDetails, error: staffDetailsError },
    { data: operationalTitles },
    { data: engagementTypes },
    { data: activeMemberNumbers },
    { data: classifications },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, full_name, member_number, access_status, access_status_reason, access_status_changed_at, access_expires_at"
      ),
    admin.from("user_roles").select("user_id, role_id"),
    admin.from("roles").select("id, slug"),
    admin.from("staff_details").select("id, operational_title_id, engagement_type_id"),
    admin.from("operational_titles").select("id, name"),
    admin.from("engagement_types").select("id, name"),
    admin.from("member_numbers").select("profile_id, classification_id").eq("status", "active"),
    admin.from("member_number_classifications").select("id, name"),
  ]);

  if (profilesError || userRolesError || rolesError || staffDetailsError) {
    const message =
      profilesError?.message ?? userRolesError?.message ?? rolesError?.message ?? staffDetailsError?.message ?? "unknown error";
    console.error("[portal admin] failed to load profiles/roles", message);
    return { ok: false, error: message };
  }

  const roleSlugById = new Map<string, RoleSlug>((roles ?? []).map((r) => [r.id, r.slug as RoleSlug]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const staffDetailsById = new Map((staffDetails ?? []).map((s) => [s.id, s]));
  const titleNameById = new Map((operationalTitles ?? []).map((t) => [t.id, t.name as string]));
  const engagementNameById = new Map((engagementTypes ?? []).map((e) => [e.id, e.name as string]));
  const classificationNameById = new Map((classifications ?? []).map((c) => [c.id, c.name as string]));
  const activeClassificationByProfileId = new Map(
    (activeMemberNumbers ?? []).map((m) => [m.profile_id, m.classification_id as string])
  );

  const rolesByUserId = new Map<string, RoleSlug[]>();
  for (const ur of userRoles ?? []) {
    const slug = roleSlugById.get(ur.role_id);
    if (!slug) continue;
    const list = rolesByUserId.get(ur.user_id) ?? [];
    list.push(slug);
    rolesByUserId.set(ur.user_id, list);
  }

  const users = allAuthUsers
    .map((u) => {
      const profile = profileById.get(u.id);
      const details = staffDetailsById.get(u.id);
      return {
        id: u.id,
        email: u.email,
        fullName: profile?.full_name ?? null,
        roles: rolesByUserId.get(u.id) ?? [],
        createdAt: u.created_at,
        emailConfirmedAt: u.email_confirmed_at,
        lastSignInAt: u.last_sign_in_at,
        accessStatus: (profile?.access_status as AccessStatus | undefined) ?? "active",
        accessStatusReason: profile?.access_status_reason ?? null,
        accessStatusChangedAt: profile?.access_status_changed_at ?? null,
        accessExpiresAt: profile?.access_expires_at ?? null,
        operationalTitleId: details?.operational_title_id ?? null,
        operationalTitleName: details?.operational_title_id
          ? (titleNameById.get(details.operational_title_id) ?? null)
          : null,
        engagementTypeId: details?.engagement_type_id ?? null,
        engagementTypeName: details?.engagement_type_id
          ? (engagementNameById.get(details.engagement_type_id) ?? null)
          : null,
        memberNumber: profile?.member_number ?? null,
        classificationId: activeClassificationByProfileId.get(u.id) ?? null,
        classificationName: (() => {
          const classificationId = activeClassificationByProfileId.get(u.id);
          return classificationId ? (classificationNameById.get(classificationId) ?? null) : null;
        })(),
      };
    })
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));

  return { ok: true, users };
}

// Mirrors private.active_super_admin_count() (migration 0009) in
// application code — that SQL function lives in the `private` schema
// specifically so it's NOT reachable via PostgREST/.rpc(), only from
// inside RLS policies. The admin client already bypasses RLS, so the
// same count is just as correctly computed here via a normal query.
export async function getActiveSuperAdminCount(): Promise<number> {
  const admin = createAdminClient();
  const { data: superAdminRole } = await admin.from("roles").select("id").eq("slug", "super_admin").single();
  if (!superAdminRole) return 0;

  const { data: holders, error } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role_id", superAdminRole.id);
  if (error || !holders?.length) return 0;

  const { data: activeProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .in(
      "id",
      holders.map((h) => h.user_id)
    )
    .eq("access_status", "active");
  if (profilesError) return 0;

  return activeProfiles?.length ?? 0;
}

export type LookupOption = { id: string; name: string; active: boolean };

export async function listOperationalTitles(): Promise<LookupOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operational_titles")
    .select("id, name, active")
    .order("sort_order");
  if (error) {
    console.error("[portal admin] failed to load operational_titles", error.message);
    return [];
  }
  return data ?? [];
}

export async function listEngagementTypes(): Promise<LookupOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("engagement_types").select("id, name, active").order("sort_order");
  if (error) {
    console.error("[portal admin] failed to load engagement_types", error.message);
    return [];
  }
  return data ?? [];
}

export type GradeOption = { id: string; grade_code: string; name: string };

// Callers must already be Admin/Super Admin — this uses the service-role
// client (bypasses the "grades: admin read" RLS policy from 0017), so it
// is only safe to call from a page/action that has already gated on
// isSuperAdmin()/hasRole(user, "admin") itself. See ADMIN_GUIDE.md's
// Grade visibility policy.
export async function listGrades(): Promise<GradeOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grades")
    .select("id, grade_code, name")
    .eq("active", true)
    .order("rank_order");
  if (error) {
    console.error("[portal admin] failed to load grades", error.message);
    return [];
  }
  return data ?? [];
}
