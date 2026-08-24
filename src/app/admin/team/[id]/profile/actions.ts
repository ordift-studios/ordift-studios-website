"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

// Master public profile content — Super-Admin-only, editing someone
// else's public-facing content, same tier as the rest of Admin -> Team.
// Upsert (not update): the row may not exist yet for a person being
// given a public profile for the first time.
export async function updatePublicProfileAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return;

  const profileId = String(formData.get("profileId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!profileId || !displayName) return;

  const bio = String(formData.get("bio") ?? "").trim() || null;
  const specialty = String(formData.get("specialty") ?? "").trim() || null;
  const socialHandle = String(formData.get("socialHandle") ?? "").trim() || null;
  const favoriteQuote = String(formData.get("favoriteQuote") ?? "").trim() || null;
  const funFact = String(formData.get("funFact") ?? "").trim() || null;

  const admin = createAdminClient();
  const { error } = await admin.from("public_profile_details").upsert(
    {
      id: profileId,
      display_name: displayName,
      bio,
      specialty,
      social_handle: socialHandle,
      favorite_quote: favoriteQuote,
      fun_fact: funFact,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[admin team] failed to update public profile", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "team.public_profile.change",
    entityType: "user",
    entityId: profileId,
  });

  revalidatePath(`/admin/team/${profileId}/profile`);
  revalidatePath("/admin/team");
  redirect(`/admin/team/${profileId}/profile`);
}

// Focal point only — called from the client-side FocalPointEditor's
// onChange, via a small non-navigating server action (no redirect, no
// form submit UX) so dragging feels immediate. Same coordinate
// convention as the Sanity-side focal point (0-100, from
// FocalPointEditor.tsx).
export async function updateAvatarFocalPointAction(profileId: string, focalX: number, focalY: number): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return;
  if (!profileId) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_focal_x: focalX, avatar_focal_y: focalY })
    .eq("id", profileId);
  if (error) {
    console.error("[admin team] failed to update avatar focal point", error.message);
    return;
  }

  revalidatePath(`/admin/team/${profileId}/profile`);
  revalidatePath("/admin/team");
}
