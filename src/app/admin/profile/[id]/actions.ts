"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { assignClassification } from "@/lib/portal/memberNumbers";
import { assignStaffPosition } from "@/lib/organization/assignPosition";

// All three actions return void and redirect back to the read-only view
// on completion — same "plain <form action={...}>, no client wrapper"
// pattern as grantRoleAction/revokeRoleAction in src/app/admin/users/
// actions.ts. Failures are logged server-side and the user lands back on
// the edit view with nothing saved, matching that same file's existing
// error-handling depth (no toast/inline-error plumbing exists yet
// anywhere in the Admin Platform); adding it is future work, not scope
// creep unique to this feature.

// Contact fields — full_name/phone — are self-service. This uses the
// request-scoped client so RLS ("profiles: update own", 0001) is the
// actual enforcement, same as the rest of the portal; no service-role
// needed since a user is only ever changing their own row here (V1 is
// self-view only, see src/lib/portal/profileCard.ts header).
export async function updateOwnContactDetailsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!fullName) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", user.id);
  if (error) {
    console.error("[admin profile] failed to update contact details", error.message);
    return;
  }

  await logActivity({ actorUserId: user.id, action: "profile.contact_details.change", entityType: "user", entityId: user.id });
  revalidatePath(`/admin/profile/${user.id}`);
  redirect(`/admin/profile/${user.id}`);
}

// Organizational assignment — Super Admin only, unchanged gate (see
// architecture note in the Admin Profile Quick Card proposal: these are
// admin-managed facts, not self-service).
//
// Ordift Organizational & Administrative Architecture V1, Phase 2
// (2026-08-25): Position is now the single authoritative input — this
// action no longer accepts independent department text, operational
// title, or grade selections. Assigning a Position resolves Department,
// Craft (operational_title_id), and Grade together, exactly as
// approved ("Position drives Grade" — Decision 3, and "do not leave the
// old independent manual Grade selector as the normal workflow").
// Clearing the Position clears all three together, rather than leaving
// a stale Department/Craft/Grade attached to no authoritative Position.
// The legacy free-text staff_details.department/job_title columns are
// never written by this action — preserved as-is, read only as a
// fallback for accounts not yet migrated into the new catalogue (see
// getProfileCard()).
//
// Phase 2.1, Part B (2026-08-25): the actual resolve-and-upsert-and-log
// logic now lives in assignStaffPosition() (src/lib/organization/assignPosition.ts),
// shared with assignStaffPositionAction in src/app/admin/users/actions.ts
// — the proper any-staff-member assignment surface — so the invariant
// can never drift between the two entry points. This function is now
// just this route's thin authorization + redirect wrapper.
export async function updateStaffOperationalDetailsAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return;

  const targetUserId = String(formData.get("userId") ?? "");
  const positionId = String(formData.get("positionId") ?? "").trim() || null;
  if (!targetUserId) return;

  const result = await assignStaffPosition({ targetUserId, positionId, actorUserId: currentUser.id });
  if (!result.ok) return;

  revalidatePath(`/admin/profile/${targetUserId}`);
  redirect(`/admin/profile/${targetUserId}`);
}

// Account Classification / Member Number — Super Admin only. Changing
// classification (or assigning one for the first time) is the only
// thing that generates a new Member Number; it archives whatever was
// previously active for this person first (see assignClassification()
// in src/lib/portal/memberNumbers.ts) and no-ops if the classification
// chosen is the same one they already have.
export async function reclassifyAccountAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return;

  const targetUserId = String(formData.get("userId") ?? "");
  const classificationId = String(formData.get("classificationId") ?? "").trim();
  if (!targetUserId || !classificationId) return;

  const result = await assignClassification(targetUserId, classificationId, currentUser.id);
  if (!result.ok) {
    console.error("[admin profile] failed to reclassify account", result.error);
    return;
  }

  revalidatePath(`/admin/profile/${targetUserId}`);
  redirect(`/admin/profile/${targetUserId}`);
}
