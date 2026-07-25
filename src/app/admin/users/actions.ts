"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, ADMIN_GRANTED_ONLY_ROLES, type RoleSlug } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "admin")) {
    throw new Error("Not authorized.");
  }
  return user;
}

function isGrantableRole(value: string): value is RoleSlug {
  return (ADMIN_GRANTED_ONLY_ROLES as string[]).includes(value);
}

export async function grantRoleAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const roleSlug = String(formData.get("role") ?? "");
  if (!userId || !isGrantableRole(roleSlug)) return;

  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("id").eq("slug", roleSlug).single();
  if (!role) return;

  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  if (error) {
    console.error("[admin] grant role failed", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "role.grant",
      entityType: "user",
      entityId: userId,
      metadata: { role: roleSlug },
    });
  }

  revalidatePath("/admin/users");
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const roleSlug = String(formData.get("role") ?? "");
  if (!userId || !isGrantableRole(roleSlug)) return;

  // Refuse to let an admin remove their own admin access from this
  // screen — the only way to end up with zero admins would be through
  // this exact self-service action, and there's no recovery path once
  // that happens (the Admin platform itself requires the admin role).
  if (roleSlug === "admin" && userId === currentUser.id) {
    console.warn("[admin] refused self-revoke of admin role", currentUser.id);
    return;
  }

  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("id").eq("slug", roleSlug).single();
  if (!role) return;

  const { error } = await admin.from("user_roles").delete().eq("user_id", userId).eq("role_id", role.id);
  if (error) {
    console.error("[admin] revoke role failed", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "role.revoke",
      entityType: "user",
      entityId: userId,
      metadata: { role: roleSlug },
    });
  }

  revalidatePath("/admin/users");
}
