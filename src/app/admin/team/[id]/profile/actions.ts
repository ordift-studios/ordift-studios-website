"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

// useActionState-compatible result — same {ok, error} shape as
// StartHandlingButton.tsx/PublishDeliverableForm.tsx elsewhere in this
// Admin app, so PublicProfileForm.tsx can drive the established
// Saving…/Saved/error feedback pattern. Deliberately no redirect() on
// success (2026-08-24 fix): redirecting back to the same URL discarded
// the "it worked" signal entirely — the page just silently re-rendered
// with the same form, which is exactly the "unresponsive" symptom this
// was built to fix. Staying in place and returning {ok: true} lets the
// client component show a real confirmation instead.
export type PublicProfileFormState = { ok: boolean; error?: string } | null;

// Master public profile content — Super-Admin-only, editing someone
// else's public-facing content, same tier as the rest of Admin -> Team.
// Upsert (not update): the row may not exist yet for a person being
// given a public profile for the first time. Wrapped in try/catch
// (2026-08-24 fix) — the previous version only logged a Postgres error
// to the server console and returned void, which is indistinguishable
// from success on the client; every failure path now returns a real
// {ok: false, error} the form can actually show.
export async function updatePublicProfileAction(
  _prevState: PublicProfileFormState,
  formData: FormData
): Promise<PublicProfileFormState> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !isSuperAdmin(currentUser)) {
      return { ok: false, error: "You are not authorized to do this." };
    }

    const profileId = String(formData.get("profileId") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (!profileId) return { ok: false, error: "Invalid request." };
    if (!displayName) return { ok: false, error: "Public Display Name / Nickname is required." };

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
      return { ok: false, error: "Couldn't save — please try again. If this keeps happening, let engineering know." };
    }

    await logActivity({
      actorUserId: currentUser.id,
      action: "team.public_profile.change",
      entityType: "user",
      entityId: profileId,
    });

    revalidatePath(`/admin/team/${profileId}/profile`);
    revalidatePath("/admin/team");
    return { ok: true };
  } catch (err) {
    console.error("[admin team] unexpected error updating public profile", err);
    return { ok: false, error: "Something went wrong saving this profile. Please try again." };
  }
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
