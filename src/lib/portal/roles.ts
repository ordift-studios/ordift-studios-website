import { createClient } from "@/lib/supabase/server";

// Mirrors the `roles` table seeded in supabase/migrations/0001_init.sql.
// A user can hold more than one of these at once (see user_roles) — e.g.
// someone can be both a Client and a Workshop Participant.
export const ROLE_SLUGS = [
  "client",
  "workshop_participant",
  "model",
  "vendor",
  "staff",
  "admin",
] as const;

export type RoleSlug = (typeof ROLE_SLUGS)[number];

// Not self-service — granting these requires an existing admin, done
// from the Admin Platform (src/app/admin/users). Self-signup always
// starts as `client` only; `workshop_participant` is granted
// automatically the first time a registration email matches the
// account (see the dual-write in the workshop-registration API route).
export const ADMIN_GRANTED_ONLY_ROLES: RoleSlug[] = ["model", "vendor", "staff", "admin"];

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: RoleSlug[];
};

// Server-only — resolves the logged-in user (if any) plus every role
// they hold, in one place, so every portal page checks the same way.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: userRoles }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("roles(slug)").eq("user_id", user.id),
  ]);

  const roles = (userRoles ?? [])
    .map((r) => (r.roles as unknown as { slug: RoleSlug } | null)?.slug)
    .filter((slug): slug is RoleSlug => Boolean(slug));

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    roles,
  };
}

export function hasRole(user: CurrentUser | null, role: RoleSlug): boolean {
  return user?.roles.includes(role) ?? false;
}

export function isStaffOrAdmin(user: CurrentUser | null): boolean {
  return hasRole(user, "staff") || hasRole(user, "admin");
}

// Where a user with a given role set should land after login — the
// first matching entry wins, most-privileged first, so a Staff member
// who is also a Client lands on the internal Admin Platform, not the
// Client view. Staff/admin land on /admin (Task #85 — the operational
// console at src/app/admin/** now supersedes the old /portal/staff and
// /portal/admin pages) rather than the customer/partner-facing /portal.
export function primaryPortalPath(roles: RoleSlug[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("staff")) return "/admin";
  if (roles.includes("vendor")) return "/portal/vendor";
  if (roles.includes("model")) return "/portal/model";
  if (roles.includes("workshop_participant")) return "/portal/workshops";
  return "/portal/client";
}
