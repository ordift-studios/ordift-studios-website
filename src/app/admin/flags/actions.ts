"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export async function toggleFlagAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const flagId = String(formData.get("flagId") ?? "");
  const nextEnabled = formData.get("nextEnabled") === "true";
  if (!flagId) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ enabled: nextEnabled, updated_by: user.id })
    .eq("id", flagId)
    .select("key")
    .single();
  if (error) {
    console.error("[admin] flag toggle failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "flag.toggle",
    entityType: "feature_flag",
    entityId: flagId,
    metadata: { key: data.key, enabled: nextEnabled },
  });

  revalidatePath("/admin/flags");
}

export async function createFlagAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const key = String(formData.get("key") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!key) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_flags")
    .insert({ key, description: description || null, enabled: false, updated_by: user.id });
  if (error) {
    console.error("[admin] flag create failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "flag.toggle",
    entityType: "feature_flag",
    metadata: { key, created: true },
  });

  revalidatePath("/admin/flags");
}
