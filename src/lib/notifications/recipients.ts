import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationPreferences } from "./preferences";

export type NotificationRecipient = { userId: string; email: string };

// CRM Lifecycle Automation Phase 1, Batch 3 (2026-08-20), refined
// same-day — resolves who should receive the internal New Booking
// notification. Deliberately a single named function the booking-event
// trigger calls by name (crmStageSync.ts's advanceStageOnFullPayment),
// not an inline query at the call site — so *how* recipients are
// determined can change later (an assigned staff member via
// project_assignments, a specific Admin, role-based filtering, a
// team/department concept) without touching the trigger itself.
//
// Today's implementation, two tiers:
//   - Every active Super Admin — unconditional. This is a deliberate
//     business rule (not merely "no narrower option exists"): the
//     Super Admin is this system's own administrator, and requiring
//     them to also opt themselves in via the same UI they use to opt
//     other people in/out risks silently losing their own alerts. Not
//     wired to notification_preferences at all.
//   - Active Admins who have explicitly opted in via
//     notification_preferences (category "new_booking", set only by a
//     Super Admin — src/app/admin/users/actions.ts's
//     setNewBookingAlertsAction). Being granted the admin role never
//     implies opted-in; a missing preference row means excluded.
// Suspended/deactivated/expired accounts are excluded from both tiers,
// mirroring getCurrentUser()'s own "roles are only usable while
// active" rule (src/lib/portal/roles.ts).
//
// Deliberately does NOT consult project_assignments yet. Whether an
// assignment should narrow this list, add to it, or replace it for an
// assigned booking is a real product decision this batch isn't scoped
// to make — see the read-only architecture report's Section 5. The
// accepted `entityType`/`entityId` parameters exist so that future
// change is additive here, not a rewrite of this function's signature
// or its one caller.
export async function resolveNewBookingRecipients(
  _entityType: string,
  _entityId: string
): Promise<NotificationRecipient[]> {
  const admin = createAdminClient();

  const { data: roles, error: rolesError } = await admin
    .from("roles")
    .select("id, slug")
    .in("slug", ["admin", "super_admin"]);
  if (rolesError || !roles || roles.length === 0) {
    console.error(
      "[notifications] resolveNewBookingRecipients: failed to load admin/super_admin role ids",
      rolesError?.message
    );
    return [];
  }
  const roleIdBySlug = new Map(roles.map((r) => [r.slug as string, r.id as string]));
  const superAdminRoleId = roleIdBySlug.get("super_admin");
  const adminRoleId = roleIdBySlug.get("admin");

  const { data: userRoles, error: userRolesError } = await admin
    .from("user_roles")
    .select("user_id, role_id")
    .in(
      "role_id",
      roles.map((r) => r.id)
    );
  if (userRolesError) {
    console.error("[notifications] resolveNewBookingRecipients: failed to load user_roles", userRolesError.message);
    return [];
  }

  const superAdminUserIds = new Set(
    (userRoles ?? []).filter((ur) => ur.role_id === superAdminRoleId).map((ur) => ur.user_id as string)
  );
  const adminUserIds = new Set(
    (userRoles ?? []).filter((ur) => ur.role_id === adminRoleId).map((ur) => ur.user_id as string)
  );

  const allUserIds = [...new Set([...superAdminUserIds, ...adminUserIds])];
  if (allUserIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, access_status, access_expires_at")
    .in("id", allUserIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const now = Date.now();
  function isActive(id: string): boolean {
    const profile = profileById.get(id);
    // No profile row at all defaults to "active", mirroring
    // getCurrentUser()'s own `?? "active"` fallback, rather than
    // silently excluding a real admin over a missing row.
    const status = (profile?.access_status as string | null) ?? "active";
    const expired = Boolean(profile?.access_expires_at && new Date(profile.access_expires_at).getTime() <= now);
    return status === "active" && !expired;
  }

  const activeSuperAdminIds = [...superAdminUserIds].filter(isActive);
  const activeAdminIds = [...adminUserIds].filter(isActive);

  // Opt-in only applies to the Admin tier — Super Admins are already
  // unconditional above, so their preference state (if any) is never
  // consulted here.
  const adminOptIns = await getNotificationPreferences(activeAdminIds, "new_booking");
  const optedInAdminIds = activeAdminIds.filter((id) => adminOptIns.get(id) === true);

  const eligibleUserIds = [...new Set([...activeSuperAdminIds, ...optedInAdminIds])];

  const resolved = await Promise.all(
    eligibleUserIds.map(async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      const email = data?.user?.email ?? null;
      return email ? { userId, email } : null;
    })
  );

  return resolved.filter((r): r is NotificationRecipient => r !== null);
}
