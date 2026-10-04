"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { actionOk, actionFail, type ActionState } from "@/lib/shared/actionState";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export async function toggleFlagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();

  const flagId = String(formData.get("flagId") ?? "");
  const nextEnabled = formData.get("nextEnabled") === "true";
  if (!flagId) return actionFail("Nothing was saved — check the details and try again.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ enabled: nextEnabled, updated_by: user.id })
    .eq("id", flagId)
    .select("key")
    .single();
  if (error) {
    console.error("[admin] flag toggle failed", error.message);
    return actionFail("Could not save your change. Please try again.");
  }

  await logActivity({
    actorUserId: user.id,
    action: "flag.toggle",
    entityType: "feature_flag",
    entityId: flagId,
    metadata: { key: data.key, enabled: nextEnabled },
  });

  revalidatePath("/admin/flags");
  return actionOk("Updated.");
}

export async function createFlagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();

  const key = String(formData.get("key") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!key) return actionFail("Nothing was saved — check the details and try again.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_flags")
    .insert({ key, description: description || null, enabled: false, updated_by: user.id });
  if (error) {
    console.error("[admin] flag create failed", error.message);
    return actionFail("Could not save your change. Please try again.");
  }

  await logActivity({
    actorUserId: user.id,
    action: "flag.toggle",
    entityType: "feature_flag",
    metadata: { key, created: true },
  });

  revalidatePath("/admin/flags");
  return actionOk("Created.");
}
