"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

type LookupTable = "operational_titles" | "engagement_types";

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    throw new Error("Only a Super Admin can manage lookup tables.");
  }
  return user;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Return type is void, not {error} — these are plain server-rendered
// forms (full-page revalidate, no client-side error display), same
// shape React expects for a bare <form action={...}>. Failures are
// still logged server-side.
export async function addLookupOptionAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const table = String(formData.get("table") ?? "") as LookupTable;
  const name = String(formData.get("name") ?? "").trim();
  if ((table !== "operational_titles" && table !== "engagement_types") || !name) return;

  const admin = createAdminClient();
  // business_id is left unset — the column default (ordift_studios_business_id())
  // fills it in, same as every other business-scoped table.
  const { error } = await admin.from(table).insert({ slug: slugify(name), name, sort_order: 500 });
  if (error) {
    console.error(`[admin] failed to add ${table} option`, error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "lookup.add",
      entityType: table,
      metadata: { name },
    });
  }

  revalidatePath("/admin/lookups");
}

export async function toggleLookupOptionAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const table = String(formData.get("table") ?? "") as LookupTable;
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if ((table !== "operational_titles" && table !== "engagement_types") || !id) return;

  const admin = createAdminClient();
  const { error } = await admin.from(table).update({ active: !active }).eq("id", id);
  if (error) {
    console.error(`[admin] failed to toggle ${table} option`, error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "lookup.toggle",
      entityType: table,
      entityId: id,
      metadata: { active: !active },
    });
  }

  revalidatePath("/admin/lookups");
}
