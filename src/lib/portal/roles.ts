import { createClient } from "@/lib/supabase/server";

// Mirrors the `roles` table seeded in supabase/migrations/0001_init.sql,
// extended in 0009_access_management.sql. A user can hold more than one
// of these at once (see user_roles) — e.g. someone can be both a Client
// and a Workshop Participant, or both Admin and Super Admin.
export const ROLE_SLUGS = [
  "client",
  "workshop_participant",
  "model",
  "vendor",
  "staff",
  "contractor",
  "admin",
  "super_admin",
] as const;

export type RoleSlug = (typeof ROLE_SLUGS)[number];

export type AccessStatus = "active" | "suspended" | "deactivated";

// Not self-service — granting these requires an existing admin, done
// from the Admin Platform (src/app/admin/users). Self-signup always
// starts as `client` only; `workshop_participant` is granted
// automatically the first time a registration email matches the
// account (see the dual-write in the workshop-registration API route).
export const ADMIN_GRANTED_ONLY_ROLES: RoleSlug[] = [
  "model",
  "vendor",
  "staff",
  "contractor",
  "admin",
  "super_admin",
];

// Only a Super Admin can grant/revoke these two — see requireSuperAdmin()
// in src/app/admin/users/actions.ts. Everything else an Admin could
// already grant, they still can.
export const SUPER_ADMIN_ONLY_ROLES: RoleSlug[] = ["admin", "super_admin"];

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: RoleSlug[];
  accessStatus: AccessStatus;
};

// Server-only — resolves the logged-in user (if any) plus every role
// they hold, in one place, so every portal page checks the same way.
//
// Suspended/deactivated/expired accounts always come back with roles: []
// regardless of what user_roles actually contains — a single central
// check here, rather than one at every call site, mirrors the same
// enforcement point private.has_role() uses on the database side (see
// migration 0009). "user_roles: read own" (0001) lets a suspended user
// still read their own role rows, so this check is not optional — it's
// the only place that turns "roles exist" into "roles are usable" for
// server-rendered pages and the layouts that gate them.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: userRoles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, access_status, access_expires_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("roles(slug)").eq("user_id", user.id),
  ]);

  const accessStatus = (profile?.access_status as AccessStatus | undefined) ?? "active";
  const expired = Boolean(profile?.access_expires_at && new Date(profile.access_expires_at) <= new Date());
  const isUsable = accessStatus === "active" && !expired;

  const roles = isUsable
    ? (userRoles ?? [])
        .map((r) => (r.roles as unknown as { slug: RoleSlug } | null)?.slug)
        .filter((slug): slug is RoleSlug => Boolean(slug))
    : [];

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    roles,
    accessStatus: isUsable ? accessStatus : accessStatus === "active" ? "suspended" : accessStatus,
  };
}

export function hasRole(user: CurrentUser | null, role: RoleSlug): boolean {
  return user?.roles.includes(role) ?? false;
}

export function isStaffOrAdmin(user: CurrentUser | null): boolean {
  return hasRole(user, "staff") || hasRole(user, "admin") || hasRole(user, "super_admin");
}

export function isSuperAdmin(user: CurrentUser | null): boolean {
  return hasRole(user, "super_admin");
}

// Where a user with a given role set should land after login — the
// first matching entry wins, most-privileged first, so a Staff member
// who is also a Client lands on the internal Admin Platform, not the
// Client view. Staff/admin/super_admin land on /admin (Task #85 — the
// operational console at src/app/admin/** now supersedes the old
// /portal/staff and /portal/admin pages) rather than the customer/
// partner-facing /portal. Contractor lands on its own project-scoped
// portal, never the internal Admin Platform.
export function primaryPortalPath(roles: RoleSlug[]): string {
  if (roles.includes("super_admin")) return "/admin";
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("staff")) return "/admin";
  if (roles.includes("contractor")) return "/portal/collaborator";
  if (roles.includes("vendor")) return "/portal/vendor";
  if (roles.includes("model")) return "/portal/model";
  if (roles.includes("workshop_participant")) return "/portal/workshops";
  return "/portal/client";
}
