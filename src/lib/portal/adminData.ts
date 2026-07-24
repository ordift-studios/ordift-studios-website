import { createAdminClient } from "@/lib/supabase/admin";
import type { RoleSlug } from "@/lib/portal/roles";

export type AdminUserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: RoleSlug[];
  createdAt: string;
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

  const allAuthUsers: { id: string; email: string | null; created_at: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await listUsersPage(admin, page);
    if (error || !data) {
      console.error("[portal admin] listUsers failed after retries", error);
      return { ok: false, error: error ?? "Failed to load accounts." };
    }
    allAuthUsers.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at })));
    if (!data.nextPage) break;
    page = data.nextPage;
  }

  const [
    { data: profiles, error: profilesError },
    { data: userRoles, error: userRolesError },
    { data: roles, error: rolesError },
  ] = await Promise.all([
    admin.from("profiles").select("id, full_name"),
    admin.from("user_roles").select("user_id, role_id"),
    admin.from("roles").select("id, slug"),
  ]);

  if (profilesError || userRolesError || rolesError) {
    const message = profilesError?.message ?? userRolesError?.message ?? rolesError?.message ?? "unknown error";
    console.error("[portal admin] failed to load profiles/roles", message);
    return { ok: false, error: message };
  }

  const roleSlugById = new Map<string, RoleSlug>((roles ?? []).map((r) => [r.id, r.slug as RoleSlug]));
  const fullNameById = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.id, p.full_name as string | null])
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
    .map((u) => ({
      id: u.id,
      email: u.email,
      fullName: fullNameById.get(u.id) ?? null,
      roles: rolesByUserId.get(u.id) ?? [],
      createdAt: u.created_at,
    }))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));

  return { ok: true, users };
}
