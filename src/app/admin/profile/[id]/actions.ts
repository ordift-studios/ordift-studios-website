"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { assignClassification } from "@/lib/portal/memberNumbers";

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

// Staff Number / Job Title / Department / Grade — operational metadata,
// Super Admin only (see architecture note in the Admin Profile Quick
// Card proposal: these are admin-managed facts, not self-service, even
// when a Super Admin is editing their own card). Uses the service-role
// client, same precedent as updateCollaboratorDetailsAction in
// src/app/admin/users/actions.ts.
export async function updateStaffOperationalDetailsAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return;

  const targetUserId = String(formData.get("userId") ?? "");
  const operationalTitleId = String(formData.get("operationalTitleId") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const gradeId = String(formData.get("gradeId") ?? "").trim() || null;
  if (!targetUserId) return;

  const admin = createAdminClient();
  const { error } = await admin.from("staff_details").upsert(
    {
      id: targetUserId,
      operational_title_id: operationalTitleId,
      department,
      grade_id: gradeId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[admin profile] failed to update operational details", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "profile.operational_details.change",
    entityType: "user",
    entityId: targetUserId,
    metadata: { operationalTitleId, department, gradeId },
  });

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
