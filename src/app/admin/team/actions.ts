"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Every action here is Super-Admin-only and touches ONLY
// team_showcase_entries — never profiles/staff_details/user_roles, and
// never anything portfolio- or project-related. Adding/removing someone
// here changes nothing about their internal account, role, or project
// history (see migration 0035's own comment).

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) return null;
  return user;
}

function refresh() {
  revalidatePath("/admin/team");
}

// Adds a person to the showcase, hidden by default (visible=false) —
// being added is a staging step, not an immediate publish. Placed at
// the end of the current order. No-ops if already added (its own
// primary key prevents a duplicate row).
export async function addToTeamAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  if (!user) return;

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("team_showcase_entries").select("id").eq("id", profileId).maybeSingle();
  if (existing) return;

  const { data: maxRow } = await admin
    .from("team_showcase_entries")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { error } = await admin.from("team_showcase_entries").insert({ id: profileId, display_order: nextOrder, visible: false });
  if (error) {
    console.error("[admin team] failed to add team member", error.message);
    return;
  }

  await logActivity({ actorUserId: user.id, action: "team.member_added", entityType: "user", entityId: profileId });
  refresh();
}

// Removes the curation row only — the person's account, role,
// staff_details, project history, and even their public_profile_details
// content all remain exactly as they were. Re-adding them later
// restores nothing lost, since nothing was deleted except this one
// control row.
export async function removeFromTeamAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  if (!user) return;

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return;

  const admin = createAdminClient();
  const { error } = await admin.from("team_showcase_entries").delete().eq("id", profileId);
  if (error) {
    console.error("[admin team] failed to remove team member", error.message);
    return;
  }

  await logActivity({ actorUserId: user.id, action: "team.member_removed", entityType: "user", entityId: profileId });
  refresh();
}

export async function toggleVisibleAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  if (!user) return;

  const profileId = String(formData.get("profileId") ?? "");
  const nextVisible = formData.get("nextVisible") === "true";
  if (!profileId) return;

  const admin = createAdminClient();
  const { error } = await admin.from("team_showcase_entries").update({ visible: nextVisible }).eq("id", profileId);
  if (error) {
    console.error("[admin team] failed to toggle visibility", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: nextVisible ? "team.member_shown" : "team.member_hidden",
    entityType: "user",
    entityId: profileId,
  });
  refresh();
}

// Swaps this entry's display_order with its immediate neighbor in the
// requested direction — same "up/down button" reordering convention
// already established for the Homepage Slideshow manager, no
// drag-and-drop dependency added.
export async function moveEntryAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  if (!user) return;

  const profileId = String(formData.get("profileId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!profileId || (direction !== "up" && direction !== "down")) return;

  const admin = createAdminClient();
  const { data: entries } = await admin
    .from("team_showcase_entries")
    .select("id, display_order")
    .order("display_order", { ascending: true });
  if (!entries) return;

  const index = entries.findIndex((e) => e.id === profileId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= entries.length) return;

  const current = entries[index];
  const swap = entries[swapIndex];

  await Promise.all([
    admin.from("team_showcase_entries").update({ display_order: swap.display_order }).eq("id", current.id),
    admin.from("team_showcase_entries").update({ display_order: current.display_order }).eq("id", swap.id),
  ]);

  refresh();
}

// Which optional fields this specific showcase entry is allowed to
// render, the collaborator flag, and the optional display-name
// override — everything the curation layer owns beyond visibility and
// order.
export async function updateShowcaseFieldsAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  if (!user) return;

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_showcase_entries")
    .update({
      is_collaborator: formData.get("isCollaborator") === "on",
      display_name_override: String(formData.get("displayNameOverride") ?? "").trim() || null,
      show_bio: formData.get("showBio") === "on",
      show_department: formData.get("showDepartment") === "on",
      show_specialty: formData.get("showSpecialty") === "on",
      show_social_handle: formData.get("showSocialHandle") === "on",
      show_quote: formData.get("showQuote") === "on",
      show_fun_fact: formData.get("showFunFact") === "on",
    })
    .eq("id", profileId);
  if (error) {
    console.error("[admin team] failed to update showcase fields", error.message);
    return;
  }

  await logActivity({ actorUserId: user.id, action: "team.showcase_fields.change", entityType: "user", entityId: profileId });
  refresh();
}
