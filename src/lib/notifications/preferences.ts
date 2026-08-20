import { createAdminClient } from "@/lib/supabase/admin";

// CRM Lifecycle Automation Phase 1, Batch 3 refinement (2026-08-20) —
// application-level allow-list for notification_preferences.category
// (supabase/migrations/0028_notification_preferences.sql). The column
// itself is plain text, not a check-constrained enum, specifically so
// a future category never requires a migration — only an addition to
// this list. Only "new_booking" is wired to anything today; the others
// are named here as the anticipated set from the read-only architecture
// discussion, not yet built.
export const NOTIFICATION_CATEGORIES = [
  "new_booking",
  // "new_enquiry", "payment_alert", "refund_cancellation_alert",
  // "project_deliverable_alert" — anticipated, not yet implemented.
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferenceResult = { ok: true } | { ok: false; error: string };

// Batch fetch — used by resolveNewBookingRecipients() to check many
// candidate admins' opt-in state in one query rather than one per user.
// A missing row for a given user means "not opted in": the returned
// Map only contains entries for rows that actually exist, so callers
// must treat `!map.has(userId)` the same as `map.get(userId) === false`.
export async function getNotificationPreferences(
  userIds: string[],
  category: NotificationCategory
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (userIds.length === 0) return result;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_preferences")
    .select("user_id, enabled")
    .eq("category", category)
    .in("user_id", userIds);

  if (error) {
    console.error("[notifications] getNotificationPreferences failed", category, error.message);
    return result;
  }

  for (const row of data ?? []) {
    result.set(row.user_id as string, Boolean(row.enabled));
  }
  return result;
}

// Single-row read — used by the Admin User Management UI to show the
// current toggle state for one user at a time.
export async function getNotificationPreference(userId: string, category: NotificationCategory): Promise<boolean> {
  const map = await getNotificationPreferences([userId], category);
  return map.get(userId) ?? false;
}

// The only write path for this table — see migration 0033: RLS default-
// deny (no INSERT/UPDATE policy exists) blocks `authenticated` writes,
// verified directly against Staging. Callers MUST enforce Super-Admin-
// only authorization themselves before calling this — this function
// does not re-check the caller's role, matching the existing pattern
// where the server action (e.g. reclassifyUserAction) is the
// authorization boundary and the lib function underneath is already-
// authorized bookkeeping.
export async function setNotificationPreference(
  userId: string,
  category: NotificationCategory,
  enabled: boolean
): Promise<NotificationPreferenceResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notification_preferences")
    .upsert({ user_id: userId, category, enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id,category" });

  if (error) {
    console.error("[notifications] setNotificationPreference failed", userId, category, error.message);
    return { ok: false, error: "Failed to save notification preference." };
  }
  return { ok: true };
}
