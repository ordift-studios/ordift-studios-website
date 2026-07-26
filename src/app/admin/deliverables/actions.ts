"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole, isStaffOrAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import type { DeliverableEntityType } from "@/lib/admin/deliverables";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

function entityBasePath(entityType: string): string {
  return entityType === "workshop_registration" ? "/admin/bookings" : "/admin/enquiries";
}

export async function createDeliverableAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const entityType = String(formData.get("entityType") ?? "") as DeliverableEntityType;
  const entityId = String(formData.get("entityId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "").trim();
  if (!entityType || !entityId || !categoryId || !title || !url) return;

  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").insert({
    entity_type: entityType,
    entity_id: entityId,
    category_id: categoryId,
    title,
    description: description || null,
    url,
    thumbnail_url: thumbnailUrl || null,
    published_by: user.id,
  });
  if (error) {
    console.error("[admin] deliverable insert failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "deliverable.published",
    entityType,
    entityId,
    metadata: { title },
  });

  revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
}

export async function deleteDeliverableAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const id = String(formData.get("id") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").delete().eq("id", id);
  if (error) {
    console.error("[admin] deliverable delete failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "deliverable.removed",
    entityType,
    entityId,
  });

  revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "admin")) {
    throw new Error("Not authorized.");
  }

  const label = String(formData.get("label") ?? "").trim();
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!label) return;

  const key = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!key) return;

  const supabase = await createClient();
  const { error } = await supabase.from("deliverable_categories").insert({ key, label });
  if (error) {
    console.error("[admin] category insert failed", error.message);
    return;
  }

  if (entityType && entityId) {
    revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
  }
}
